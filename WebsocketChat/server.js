const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// In-memory data storage
const users = new Map(); // userId -> {username, socketId, online, friends}
const chats = new Map(); // chatId -> {participants, messages, type}
const pendingInvites = new Map(); // userId -> [{from, chatId}]

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  let currentUser = null;

  // User login/registration
  socket.on('login', (userData, callback) => {
    const { userId, username } = userData;
    
    if (!users.has(userId)) {
      // New user
      users.set(userId, {
        userId,
        username,
        socketId: socket.id,
        online: true,
        friends: []
      });
    } else {
      // Existing user
      const user = users.get(userId);
      user.socketId = socket.id;
      user.online = true;
      users.set(userId, user);
    }
    
    currentUser = userId;
    
    // Set up pending invites if not exists
    if (!pendingInvites.has(userId)) {
      pendingInvites.set(userId, []);
    }
    
    // Notify friends that user is online
    const user = users.get(userId);
    user.friends.forEach(friendId => {
      const friend = users.get(friendId);
      if (friend && friend.online) {
        io.to(friend.socketId).emit('friend-online', { userId, username });
      }
    });
    
    callback({
      success: true,
      user: users.get(userId),
      pendingInvites: pendingInvites.get(userId)
    });
  });

  // Get friends list
  socket.on('get-friends', (_, callback) => {
    if (!currentUser) return;
    
    const user = users.get(currentUser);
    const friendsList = user.friends.map(friendId => {
      const friend = users.get(friendId);
      return {
        userId: friendId,
        username: friend.username,
        online: friend.online
      };
    });
    
    callback(friendsList);
  });

  // Add friend
  socket.on('add-friend', (friendData, callback) => {
    if (!currentUser) return;
    
    const { friendId } = friendData;
    
    if (!users.has(friendId)) {
      return callback({ success: false, message: 'User not found' });
    }
    
    const user = users.get(currentUser);
    const friend = users.get(friendId);
    
    if (!user.friends.includes(friendId)) {
      user.friends.push(friendId);
      users.set(currentUser, user);
    }
    
    if (!friend.friends.includes(currentUser)) {
      friend.friends.push(currentUser);
      users.set(friendId, friend);
    }
    
    // Notify friend if online
    if (friend.online) {
      io.to(friend.socketId).emit('friend-added', {
        userId: currentUser,
        username: user.username
      });
    }
    
    callback({ success: true });
  });

  // Send chat invite
  socket.on('invite-to-chat', (inviteData, callback) => {
    if (!currentUser) return;
    
    const { friendIds, groupChat } = inviteData;
    const user = users.get(currentUser);
    
    // Validate all friends exist and are online
    for (const friendId of friendIds) {
      if (!users.has(friendId)) {
        return callback({ success: false, message: `User ${friendId} not found` });
      }
      
      const friend = users.get(friendId);
      if (!friend.online) {
        return callback({ success: false, message: `User ${friend.username} is offline` });
      }
      
      if (!user.friends.includes(friendId)) {
        return callback({ success: false, message: `User ${friend.username} is not your friend` });
      }
    }
    
    // For group chats, check if a chat with the exact same participants already exists
    if (groupChat && friendIds.length > 1) {
      const participants = [currentUser, ...friendIds].sort();
      
      for (const [chatId, chat] of chats.entries()) {
        if (chat.type === 'group' && 
            chat.participants.length === participants.length && 
            chat.participants.sort().every((id, idx) => id === participants[idx])) {
          return callback({ success: false, message: 'A group chat with these participants already exists' });
        }
      }
    }
    
    // Create a chat
    const chatId = Date.now().toString();
    const participants = groupChat ? [currentUser, ...friendIds] : [currentUser, friendIds[0]];
    
    chats.set(chatId, {
      chatId,
      participants,
      messages: [],
      type: groupChat ? 'group' : 'direct'
    });
    
    // Send invites to all friends
    friendIds.forEach(friendId => {
      const friend = users.get(friendId);
      const friendInvites = pendingInvites.get(friendId) || [];
      
      friendInvites.push({
        from: currentUser,
        fromName: user.username,
        chatId,
        isGroup: groupChat,
        participants: participants.map(id => ({
          userId: id,
          username: users.get(id).username
        }))
      });
      
      pendingInvites.set(friendId, friendInvites);
      
      // Notify friend
      io.to(friend.socketId).emit('chat-invite', {
        from: currentUser,
        fromName: user.username,
        chatId,
        isGroup: groupChat
      });
    });
    
    callback({ success: true, chatId });
  });

  // Respond to chat invite
  socket.on('respond-to-invite', (responseData, callback) => {
    if (!currentUser) return;
    
    const { chatId, accept } = responseData;
    const userInvites = pendingInvites.get(currentUser) || [];
    const inviteIndex = userInvites.findIndex(invite => invite.chatId === chatId);
    
    if (inviteIndex === -1) {
      return callback({ success: false, message: 'Invite not found' });
    }
    
    const invite = userInvites[inviteIndex];
    userInvites.splice(inviteIndex, 1);
    pendingInvites.set(currentUser, userInvites);
    
    if (!accept) {
      // Notify sender that invite was declined
      const sender = users.get(invite.from);
      if (sender && sender.online) {
        io.to(sender.socketId).emit('invite-declined', {
          userId: currentUser,
          username: users.get(currentUser).username,
          chatId
        });
      }
      
      return callback({ success: true });
    }
    
    // Accept the invite
    const chat = chats.get(chatId);
    if (!chat) {
      return callback({ success: false, message: 'Chat not found' });
    }
    
    // Notify all participants that user joined
    chat.participants.forEach(participantId => {
      if (participantId !== currentUser) {
        const participant = users.get(participantId);
        if (participant && participant.online) {
          io.to(participant.socketId).emit('user-joined-chat', {
            userId: currentUser,
            username: users.get(currentUser).username,
            chatId
          });
        }
      }
    });
    
    callback({
      success: true,
      chat: {
        chatId,
        participants: chat.participants.map(id => ({
          userId: id,
          username: users.get(id).username
        })),
        messages: chat.messages,
        type: chat.type
      }
    });
  });

  // Get chat history
  socket.on('get-chat', (chatData, callback) => {
    if (!currentUser) return;
    
    const { chatId } = chatData;
    const chat = chats.get(chatId);
    
    if (!chat) {
      return callback({ success: false, message: 'Chat not found' });
    }
    
    if (!chat.participants.includes(currentUser)) {
      return callback({ success: false, message: 'You are not a participant in this chat' });
    }
    
    callback({
      success: true,
      chat: {
        chatId,
        participants: chat.participants.map(id => ({
          userId: id,
          username: users.get(id).username
        })),
        messages: chat.messages,
        type: chat.type
      }
    });
  });

  // Get all user chats
  socket.on('get-all-chats', (_, callback) => {
    if (!currentUser) return;
    
    const userChats = [];
    
    for (const [chatId, chat] of chats.entries()) {
      if (chat.participants.includes(currentUser)) {
        userChats.push({
          chatId,
          participants: chat.participants.map(id => ({
            userId: id,
            username: users.get(id).username
          })),
          lastMessage: chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null,
          type: chat.type
        });
      }
    }
    
    callback(userChats);
  });

  // Send message to chat
  socket.on('send-message', (messageData, callback) => {
    if (!currentUser) return;
    
    const { chatId, content } = messageData;
    const chat = chats.get(chatId);
    
    if (!chat) {
      return callback({ success: false, message: 'Chat not found' });
    }
    
    if (!chat.participants.includes(currentUser)) {
      return callback({ success: false, message: 'You are not a participant in this chat' });
    }
    
    const message = {
      id: Date.now().toString(),
      sender: currentUser,
      senderName: users.get(currentUser).username,
      content,
      timestamp: Date.now()
    };
    
    chat.messages.push(message);
    
    // Send message to all participants
    chat.participants.forEach(participantId => {
      if (participantId !== currentUser) {
        const participant = users.get(participantId);
        if (participant && participant.online) {
          io.to(participant.socketId).emit('new-message', {
            chatId,
            message
          });
        }
      }
    });
    
    callback({ success: true, message });
  });

  // Leave chat
  socket.on('leave-chat', (chatData, callback) => {
    if (!currentUser) return;
    
    const { chatId } = chatData;
    const chat = chats.get(chatId);
    
    if (!chat) {
      return callback({ success: false, message: 'Chat not found' });
    }
    
    if (!chat.participants.includes(currentUser)) {
      return callback({ success: false, message: 'You are not a participant in this chat' });
    }
    
    // Remove user from participants
    const userIndex = chat.participants.indexOf(currentUser);
    chat.participants.splice(userIndex, 1);
    
    // If no participants left, delete the chat
    if (chat.participants.length === 0) {
      chats.delete(chatId);
      return callback({ success: true, deleted: true });
    }
    
    // Update the chat
    chats.set(chatId, chat);
    
    // Notify remaining participants
    chat.participants.forEach(participantId => {
      const participant = users.get(participantId);
      if (participant && participant.online) {
        io.to(participant.socketId).emit('user-left-chat', {
          userId: currentUser,
          username: users.get(currentUser).username,
          chatId
        });
      }
    });
    
    callback({ success: true, deleted: false });
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    
    if (!currentUser) return;
    
    const user = users.get(currentUser);
    user.online = false;
    users.set(currentUser, user);
    
    // Notify friends user is offline
    user.friends.forEach(friendId => {
      const friend = users.get(friendId);
      if (friend && friend.online) {
        io.to(friend.socketId).emit('friend-offline', {
          userId: currentUser,
          username: user.username
        });
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 