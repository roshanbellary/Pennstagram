// DOM Elements
const loginContainer = document.getElementById('login-container');
const mainContainer = document.getElementById('main-container');
const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn');
const currentUserEl = document.getElementById('current-user');
const addFriendBtn = document.getElementById('add-friend-btn');
const friendIdInput = document.getElementById('friend-id-input');
const friendsList = document.getElementById('friends-list');
const chatsList = document.getElementById('chats-list');
const invitesList = document.getElementById('invites-list');
const inviteCount = document.getElementById('invite-count');
const chatName = document.getElementById('chat-name');
const chatMessages = document.getElementById('chat-messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const inviteToChatBtn = document.getElementById('invite-to-chat-btn');
const leaveChatBtn = document.getElementById('leave-chat-btn');
const inviteModal = document.getElementById('invite-modal');
const inviteFriendsList = document.getElementById('invite-friends-list');
const groupChatCheckbox = document.getElementById('group-chat-checkbox');
const sendInviteBtn = document.getElementById('send-invite-btn');
const closeModalBtns = document.querySelectorAll('.close-modal');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// App State
const state = {
  socket: null,
  userId: null,
  username: null,
  friends: [],
  chats: [],
  pendingInvites: [],
  currentChatId: null,
  selectedFriendsForInvite: []
};

// Initialize Socket.IO
function initializeSocket() {
  state.socket = io();
  
  // Socket event listeners
  state.socket.on('friend-online', handleFriendOnline);
  state.socket.on('friend-offline', handleFriendOffline);
  state.socket.on('friend-added', handleFriendAdded);
  state.socket.on('chat-invite', handleChatInvite);
  state.socket.on('invite-declined', handleInviteDeclined);
  state.socket.on('user-joined-chat', handleUserJoinedChat);
  state.socket.on('user-left-chat', handleUserLeftChat);
  state.socket.on('new-message', handleNewMessage);
}

// Login handler
function handleLogin() {
  const username = usernameInput.value.trim();
  
  if (!username) {
    alert('Please enter a username');
    return;
  }
  
  // Generate a random user ID for this demo
  // In a real app, this would be handled by a proper authentication system
  const userId = 'user_' + Date.now();
  
  state.userId = userId;
  state.username = username;
  
  initializeSocket();
  
  state.socket.emit('login', { userId, username }, (response) => {
    if (response.success) {
      loginContainer.classList.add('hidden');
      mainContainer.classList.remove('hidden');
      currentUserEl.textContent = `Welcome, ${username}! (ID: ${userId})`;
      
      state.pendingInvites = response.pendingInvites;
      updateInvitesBadge();
      
      // Get friends list
      state.socket.emit('get-friends', {}, (friendsList) => {
        state.friends = friendsList;
        renderFriends();
      });
      
      // Get all chats
      state.socket.emit('get-all-chats', {}, (chats) => {
        state.chats = chats;
        renderChats();
      });
    }
  });
}

// Add friend handler
function handleAddFriend() {
  const friendId = friendIdInput.value.trim();
  
  if (!friendId) {
    alert('Please enter a friend ID');
    return;
  }
  
  if (friendId === state.userId) {
    alert('You cannot add yourself as a friend');
    return;
  }
  
  state.socket.emit('add-friend', { friendId }, (response) => {
    if (response.success) {
      friendIdInput.value = '';
      state.socket.emit('get-friends', {}, (friendsList) => {
        state.friends = friendsList;
        renderFriends();
      });
    } else {
      alert(response.message);
    }
  });
}

// Socket event handlers
function handleFriendOnline(data) {
  const friendIndex = state.friends.findIndex(f => f.userId === data.userId);
  
  if (friendIndex !== -1) {
    state.friends[friendIndex].online = true;
    renderFriends();
  }
}

function handleFriendOffline(data) {
  const friendIndex = state.friends.findIndex(f => f.userId === data.userId);
  
  if (friendIndex !== -1) {
    state.friends[friendIndex].online = false;
    renderFriends();
  }
}

function handleFriendAdded(data) {
  state.socket.emit('get-friends', {}, (friendsList) => {
    state.friends = friendsList;
    renderFriends();
  });
}

function handleChatInvite(data) {
  const { from, fromName, chatId, isGroup } = data;
  
  // Add to pending invites
  state.pendingInvites.push({ from, fromName, chatId, isGroup });
  updateInvitesBadge();
  renderInvites();
}

function handleInviteDeclined(data) {
  alert(`${data.username} declined your chat invitation.`);
}

function handleUserJoinedChat(data) {
  if (state.currentChatId === data.chatId) {
    renderChatInfo(`${data.username} joined the chat`);
    
    // Refresh chat to update participants
    state.socket.emit('get-chat', { chatId: data.chatId }, (response) => {
      if (response.success) {
        updateCurrentChat(response.chat);
      }
    });
  }
  
  // Refresh chats list
  state.socket.emit('get-all-chats', {}, (chats) => {
    state.chats = chats;
    renderChats();
  });
}

function handleUserLeftChat(data) {
  if (state.currentChatId === data.chatId) {
    renderChatInfo(`${data.username} left the chat`);
    
    // Refresh chat to update participants
    state.socket.emit('get-chat', { chatId: data.chatId }, (response) => {
      if (response.success) {
        updateCurrentChat(response.chat);
      }
    });
  }
  
  // Refresh chats list
  state.socket.emit('get-all-chats', {}, (chats) => {
    state.chats = chats;
    renderChats();
  });
}

function handleNewMessage(data) {
  const { chatId, message } = data;
  
  // Update chat list
  const chatIndex = state.chats.findIndex(c => c.chatId === chatId);
  if (chatIndex !== -1) {
    state.chats[chatIndex].lastMessage = message;
    renderChats();
  }
  
  // If the message is for the current chat, render it
  if (state.currentChatId === chatId) {
    renderMessage(message);
    scrollToBottom();
  }
}

// UI Functions
function renderFriends() {
  friendsList.innerHTML = '';
  
  if (state.friends.length === 0) {
    friendsList.innerHTML = '<div class="chat-info">No friends yet. Add friends using their ID.</div>';
    return;
  }
  
  state.friends.forEach(friend => {
    const friendEl = document.createElement('div');
    friendEl.classList.add('list-item');
    
    friendEl.innerHTML = `
      <div style="display: flex; align-items: center;">
        <div class="user-status ${friend.online ? 'online' : 'offline'}"></div>
        ${friend.username} ${friend.online ? '(Online)' : '(Offline)'}
      </div>
      <button class="btn btn-small" ${!friend.online ? 'disabled' : ''}>Chat</button>
    `;
    
    const chatBtn = friendEl.querySelector('.btn');
    chatBtn.addEventListener('click', () => {
      inviteToChat([friend.userId], false);
    });
    
    friendsList.appendChild(friendEl);
  });
  
  // Update the invite modal friend list too
  renderInviteFriendsList();
}

function renderChats() {
  chatsList.innerHTML = '';
  
  if (state.chats.length === 0) {
    chatsList.innerHTML = '<div class="chat-info">No chats yet. Start a chat with a friend.</div>';
    return;
  }
  
  state.chats.forEach(chat => {
    const chatEl = document.createElement('div');
    chatEl.classList.add('list-item');
    
    // Create a chat name based on participants (excluding current user)
    const participants = chat.participants.filter(p => p.userId !== state.userId);
    const chatTitle = chat.type === 'group' 
      ? `Group: ${participants.map(p => p.username).join(', ')}`
      : participants[0].username;
    
    const lastMsg = chat.lastMessage 
      ? `${chat.lastMessage.senderName}: ${chat.lastMessage.content.substring(0, 20)}${chat.lastMessage.content.length > 20 ? '...' : ''}`
      : 'No messages yet';
    
    chatEl.innerHTML = `
      <div>
        <div><strong>${chatTitle}</strong></div>
        <div style="font-size: 12px; color: #888;">${lastMsg}</div>
      </div>
    `;
    
    chatEl.addEventListener('click', () => {
      openChat(chat.chatId);
    });
    
    chatsList.appendChild(chatEl);
  });
}

function renderInvites() {
  invitesList.innerHTML = '';
  
  if (state.pendingInvites.length === 0) {
    invitesList.innerHTML = '<div class="chat-info">No pending invites.</div>';
    return;
  }
  
  state.pendingInvites.forEach(invite => {
    const inviteEl = document.createElement('div');
    inviteEl.classList.add('list-item');
    
    const inviteMsg = invite.isGroup 
      ? `${invite.fromName} invited you to a group chat`
      : `${invite.fromName} invited you to chat`;
    
    inviteEl.innerHTML = `
      <div>${inviteMsg}</div>
      <div class="invite-action">
        <button class="btn btn-small">Accept</button>
        <button class="btn btn-small btn-danger">Decline</button>
      </div>
    `;
    
    const acceptBtn = inviteEl.querySelector('.btn:not(.btn-danger)');
    const declineBtn = inviteEl.querySelector('.btn-danger');
    
    acceptBtn.addEventListener('click', () => {
      respondToInvite(invite.chatId, true);
    });
    
    declineBtn.addEventListener('click', () => {
      respondToInvite(invite.chatId, false);
    });
    
    invitesList.appendChild(inviteEl);
  });
}

function renderInviteFriendsList() {
  inviteFriendsList.innerHTML = '';
  
  const onlineFriends = state.friends.filter(f => f.online);
  
  if (onlineFriends.length === 0) {
    inviteFriendsList.innerHTML = '<div class="chat-info">No online friends to invite.</div>';
    return;
  }
  
  onlineFriends.forEach(friend => {
    const friendEl = document.createElement('div');
    friendEl.classList.add('list-item');
    
    const isSelected = state.selectedFriendsForInvite.includes(friend.userId);
    
    friendEl.innerHTML = `
      <div style="display: flex; align-items: center;">
        <input type="checkbox" ${isSelected ? 'checked' : ''}>
        <div class="user-status online" style="margin-left: 10px;"></div>
        ${friend.username}
      </div>
    `;
    
    const checkbox = friendEl.querySelector('input');
    checkbox.addEventListener('change', () => {
      toggleFriendForInvite(friend.userId);
    });
    
    inviteFriendsList.appendChild(friendEl);
  });
}

function renderMessages(messages) {
  chatMessages.innerHTML = '';
  
  if (messages.length === 0) {
    chatMessages.innerHTML = '<div class="chat-info">No messages yet.</div>';
    return;
  }
  
  messages.forEach(message => {
    renderMessage(message);
  });
  
  scrollToBottom();
}

function renderMessage(message) {
  const messageEl = document.createElement('div');
  messageEl.classList.add('message');
  
  if (message.sender === state.userId) {
    messageEl.classList.add('message-outgoing');
  } else {
    messageEl.classList.add('message-incoming');
  }
  
  const timestamp = new Date(message.timestamp).toLocaleTimeString();
  
  messageEl.innerHTML = `
    <div class="message-info">
      ${message.sender !== state.userId ? message.senderName : 'You'} • ${timestamp}
    </div>
    <div>${message.content}</div>
  `;
  
  chatMessages.appendChild(messageEl);
}

function renderChatInfo(text) {
  const infoEl = document.createElement('div');
  infoEl.classList.add('chat-info');
  infoEl.textContent = text;
  chatMessages.appendChild(infoEl);
  scrollToBottom();
}

function updateInvitesBadge() {
  if (state.pendingInvites.length > 0) {
    inviteCount.textContent = state.pendingInvites.length;
    inviteCount.classList.remove('hidden');
  } else {
    inviteCount.classList.add('hidden');
  }
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Chat Functions
function openChat(chatId) {
  state.socket.emit('get-chat', { chatId }, (response) => {
    if (response.success) {
      updateCurrentChat(response.chat);
    } else {
      alert(response.message);
    }
  });
}

function updateCurrentChat(chat) {
  state.currentChatId = chat.chatId;
  
  // Update UI
  const participants = chat.participants.filter(p => p.userId !== state.userId);
  
  // Create chat name based on participants
  const chatTitle = chat.type === 'group' 
    ? `Group Chat (${participants.length + 1} members)` 
    : participants[0].username;
  
  chatName.textContent = chatTitle;
  
  // Show chat controls
  messageForm.classList.remove('hidden');
  inviteToChatBtn.classList.remove('hidden');
  leaveChatBtn.classList.remove('hidden');
  
  // Render messages
  renderMessages(chat.messages);
  
  // Switch to chat tab if not already active
  const chatTabBtn = document.querySelector('.tab-btn[data-tab="chats"]');
  const activateTab = new Event('click');
  chatTabBtn.dispatchEvent(activateTab);
}

function sendMessage() {
  const content = messageInput.value.trim();
  
  if (!content || !state.currentChatId) return;
  
  state.socket.emit('send-message', {
    chatId: state.currentChatId,
    content
  }, (response) => {
    if (response.success) {
      messageInput.value = '';
      renderMessage(response.message);
      scrollToBottom();
      
      // Update chat list
      state.socket.emit('get-all-chats', {}, (chats) => {
        state.chats = chats;
        renderChats();
      });
    } else {
      alert(response.message);
    }
  });
}

function inviteToChat(friendIds, isGroup) {
  state.socket.emit('invite-to-chat', {
    friendIds,
    groupChat: isGroup
  }, (response) => {
    if (response.success) {
      if (isGroup) {
        closeInviteModal();
      }
      
      openChat(response.chatId);
    } else {
      alert(response.message);
    }
  });
}

function respondToInvite(chatId, accept) {
  state.socket.emit('respond-to-invite', {
    chatId,
    accept
  }, (response) => {
    if (response.success) {
      // Remove the invite
      state.pendingInvites = state.pendingInvites.filter(i => i.chatId !== chatId);
      updateInvitesBadge();
      renderInvites();
      
      if (accept) {
        // Open the chat
        openChat(chatId);
        
        // Refresh chats list
        state.socket.emit('get-all-chats', {}, (chats) => {
          state.chats = chats;
          renderChats();
        });
      }
    } else {
      alert(response.message);
    }
  });
}

function leaveChat() {
  if (!state.currentChatId) return;
  
  if (confirm('Are you sure you want to leave this chat?')) {
    state.socket.emit('leave-chat', {
      chatId: state.currentChatId
    }, (response) => {
      if (response.success) {
        // Reset current chat
        state.currentChatId = null;
        chatName.textContent = 'Select a chat';
        chatMessages.innerHTML = '';
        messageForm.classList.add('hidden');
        inviteToChatBtn.classList.add('hidden');
        leaveChatBtn.classList.add('hidden');
        
        // Refresh chats list
        state.socket.emit('get-all-chats', {}, (chats) => {
          state.chats = chats;
          renderChats();
        });
      } else {
        alert(response.message);
      }
    });
  }
}

// Modal Functions
function openInviteModal() {
  state.selectedFriendsForInvite = [];
  renderInviteFriendsList();
  inviteModal.classList.remove('hidden');
}

function closeInviteModal() {
  inviteModal.classList.add('hidden');
}

function toggleFriendForInvite(friendId) {
  const index = state.selectedFriendsForInvite.indexOf(friendId);
  
  if (index === -1) {
    state.selectedFriendsForInvite.push(friendId);
  } else {
    state.selectedFriendsForInvite.splice(index, 1);
  }
}

function sendGroupInvite() {
  if (state.selectedFriendsForInvite.length === 0) {
    alert('Please select at least one friend to invite');
    return;
  }
  
  const isGroup = groupChatCheckbox.checked || state.selectedFriendsForInvite.length > 1;
  inviteToChat(state.selectedFriendsForInvite, isGroup);
}

// Tab Functions
function switchTab(tabName) {
  // Hide all tab contents
  tabContents.forEach(content => {
    content.classList.remove('active');
  });
  
  // Deactivate all tab buttons
  tabBtns.forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Activate the selected tab
  document.getElementById(`${tabName}-tab`).classList.add('active');
  document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');
}

// Event Listeners
loginBtn.addEventListener('click', handleLogin);
usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleLogin();
});

addFriendBtn.addEventListener('click', handleAddFriend);
friendIdInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleAddFriend();
});

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

inviteToChatBtn.addEventListener('click', openInviteModal);
leaveChatBtn.addEventListener('click', leaveChat);
sendInviteBtn.addEventListener('click', sendGroupInvite);

closeModalBtns.forEach(btn => {
  btn.addEventListener('click', closeInviteModal);
});

inviteModal.addEventListener('click', (e) => {
  if (e.target === inviteModal) {
    closeInviteModal();
  }
});

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
  });
}); 