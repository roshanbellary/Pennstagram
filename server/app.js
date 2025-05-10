import express from 'express';
import fs from 'fs';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { get_db_connection } from './models/rdbms.js';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

import register_routes from './routes/register_routes.js';
import session from 'express-session';

// Import Kafka services
import { initializeKafkaServices } from './services/kafka-service.js';

// Import the adsorption scheduler
import './services/adsorptionScheduler.js';

// Read config file instead of importing it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configFile = fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8');
const config = JSON.parse(configFile);

import dotenv from 'dotenv';
dotenv.config();
const host = process.env.SITE_HOST; // Use SITE_HOST from .env

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});
const port = config.serverPort;

app.use(cors({
  origin: 'http://localhost:3000',  // Allow requests from React dev server
  methods: ['POST', 'PUT', 'GET', 'OPTIONS', 'HEAD'],
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: 'nets2120_insecure', 
  saveUninitialized: true, 
  resave: true,
  cookie: { 
    httpOnly: false,
    secure: false, // Set to true in production with HTTPS
    sameSite: 'lax', // Use 'none' with secure: true in production
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

// Online users tracking
const onlineUsers = new Map(); // userId -> socketId

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('New socket connection: ' + socket.id);

  // User authentication and tracking
  socket.on('user_connected', async (userId) => {
    console.log(`User ${userId} connected with socket ${socket.id}`);
    onlineUsers.set(userId, socket.id);
    
    // Notify friends that this user is online
    notifyFriendsOfOnlineStatus(userId, true);
  });

  // Chat invite
  socket.on('send_chat_invite', async (data) => {
    console.log('Chat invite received:', data);
    const { senderId, receiverId, senderUsername } = data;
    
    if (onlineUsers.has(receiverId)) {
      const receiverSocketId = onlineUsers.get(receiverId);
      console.log(`Sending chat invite to ${receiverId} via socket ${receiverSocketId}`);
      io.to(receiverSocketId).emit('chat_invite', {
        senderId,
        senderUsername
      });
    } else {
      console.log(`Receiver ${receiverId} is not online, invite not sent`);
    }
  });

  // Chat invite response
  socket.on('chat_invite_response', async (data) => {
    const { senderId, receiverId, accepted } = data;
    
    if (onlineUsers.has(senderId)) {
      const senderSocketId = onlineUsers.get(senderId);
      
      if (accepted) {
        // Create or fetch chat session
        const dbaccess = get_db_connection();
        await dbaccess.connect();
        
        // Check if a 1-on-1 chat already exists
        const [existingChat] = await dbaccess.send_sql(`
          SELECT cs.session_id
          FROM chat_sessions cs
          JOIN chat_participants cp1 ON cs.session_id = cp1.session_id AND cp1.user_id = ?
          JOIN chat_participants cp2 ON cs.session_id = cp2.session_id AND cp2.user_id = ?
          WHERE cs.is_group = FALSE
          AND cp1.left_at IS NULL
          AND cp2.left_at IS NULL
        `, [senderId, receiverId]);
        
        let sessionId;
        
        if (existingChat.length > 0) {
          // Chat already exists
          sessionId = existingChat[0].session_id;
        } else {
          // Create new chat session
          const [result] = await dbaccess.send_sql(
            'INSERT INTO chat_sessions (is_group) VALUES (FALSE)'
          );
          sessionId = result.insertId;
          
          // Add participants
          await dbaccess.send_sql(
            'INSERT INTO chat_participants (session_id, user_id) VALUES (?, ?)',
            [sessionId, senderId]
          );
          
          await dbaccess.send_sql(
            'INSERT INTO chat_participants (session_id, user_id) VALUES (?, ?)',
            [sessionId, receiverId]
          );
        }
        
        // Get chat history
        const [messages] = await dbaccess.send_sql(`
          SELECT cm.message_id, cm.content, cm.sent_at, cm.sender_id, u.username as sender_username
          FROM chat_messages cm
          JOIN users u ON cm.sender_id = u.user_id
          WHERE cm.session_id = ?
          ORDER BY cm.sent_at ASC
        `, [sessionId]);
        
        // Notify both users about the session
        io.to(senderSocketId).emit('chat_session_created', {
          sessionId,
          otherUserId: receiverId,
          messages
        });
        
        if (onlineUsers.has(receiverId)) {
          const receiverSocketId = onlineUsers.get(receiverId);
          io.to(receiverSocketId).emit('chat_session_created', {
            sessionId,
            otherUserId: senderId,
            messages
          });
        }
      } else {
        // Notify the sender that the invite was declined
        io.to(senderSocketId).emit('chat_invite_declined', { receiverId });
      }
    }
  });

  // Handle chat messages
  socket.on('send_message', async (data) => {
    console.log('Message received:', data);
    const { sessionId, senderId, content } = data;
    
    try {
      const dbaccess = get_db_connection();
      await dbaccess.connect();
      
      // Save message to database
      const [result] = await dbaccess.send_sql(
        'INSERT INTO chat_messages (session_id, sender_id, content) VALUES (?, ?, ?)',
        [sessionId, senderId, content]
      );
      
      const messageId = result.insertId;
      console.log(`Message saved to database with ID ${messageId}`);
      
      // Get message with sender username
      const [messageData] = await dbaccess.send_sql(`
        SELECT cm.message_id, cm.content, cm.sent_at, cm.sender_id, u.username as sender_username
        FROM chat_messages cm
        JOIN users u ON cm.sender_id = u.user_id
        WHERE cm.message_id = ?
      `, [messageId]);
      
      const message = messageData[0];
      
      // Get all participants in the session
      const [participants] = await dbaccess.send_sql(`
        SELECT user_id
        FROM chat_participants
        WHERE session_id = ?
        AND left_at IS NULL
      `, [sessionId]);
      
      console.log(`Broadcasting message to ${participants.length} participants`);
      
      // Send message to all participants who are online
      participants.forEach(participant => {
        if (onlineUsers.has(participant.user_id)) {
          const participantSocketId = onlineUsers.get(participant.user_id);
          console.log(`Sending message to participant ${participant.user_id} via socket ${participantSocketId}`);
          
          // Make sure the message includes the session_id to easily filter on client side
          const messageWithSession = {
            ...message,
            session_id: sessionId
          };
          
          io.to(participantSocketId).emit('receive_message', messageWithSession);
        } else {
          console.log(`Participant ${participant.user_id} is not online, message not sent`);
        }
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  // Handle ping to keep connections alive
  socket.on('ping', () => {
    console.log(`Received ping from ${socket.id}`);
    // Just acknowledge the ping
    socket.emit('pong');
  });

  // Add user to group chat
  socket.on('invite_to_group', async (data) => {
    const { sessionId, inviterId, inviteeId } = data;
    
    const dbaccess = get_db_connection();
    await dbaccess.connect();
    
    // Check if the session is a group chat
    const [sessionCheck] = await dbaccess.send_sql(
      'SELECT is_group FROM chat_sessions WHERE session_id = ?',
      [sessionId]
    );
    
    if (sessionCheck.length === 0 || !sessionCheck[0].is_group) {
      // Convert to group chat if it's not already
      await dbaccess.send_sql(
        'UPDATE chat_sessions SET is_group = TRUE WHERE session_id = ?',
        [sessionId]
      );
    }
    
    // Check if user is already in this chat
    const [participantCheck] = await dbaccess.send_sql(
      'SELECT * FROM chat_participants WHERE session_id = ? AND user_id = ?',
      [sessionId, inviteeId]
    );
    
    if (participantCheck.length > 0) {
      // User is already in the chat, send error to inviter
      if (onlineUsers.has(inviterId)) {
        const inviterSocketId = onlineUsers.get(inviterId);
        io.to(inviterSocketId).emit('group_invite_error', {
          message: 'User is already a member of this chat'
        });
      }
      return;
    }
    
    // Add user to group chat
    await dbaccess.send_sql(
      'INSERT INTO chat_participants (session_id, user_id) VALUES (?, ?)',
      [sessionId, inviteeId]
    );
    
    // If invitee is online, send them an invitation
    if (onlineUsers.has(inviteeId)) {
      const inviteeSocketId = onlineUsers.get(inviteeId);
      
      // Get session info and messages
      const [sessionInfo] = await dbaccess.send_sql(
        'SELECT * FROM chat_sessions WHERE session_id = ?',
        [sessionId]
      );
      
      const [messages] = await dbaccess.send_sql(`
        SELECT cm.message_id, cm.content, cm.sent_at, cm.sender_id, u.username as sender_username
        FROM chat_messages cm
        JOIN users u ON cm.sender_id = u.user_id
        WHERE cm.session_id = ?
        ORDER BY cm.sent_at ASC
      `, [sessionId]);
      
      // Get all participants
      const [participants] = await dbaccess.send_sql(`
        SELECT cp.user_id, u.username
        FROM chat_participants cp
        JOIN users u ON cp.user_id = u.user_id
        WHERE cp.session_id = ?
        AND cp.left_at IS NULL
      `, [sessionId]);
      
      // Notify the invited user
      io.to(inviteeSocketId).emit('added_to_group', {
        sessionId,
        sessionInfo: sessionInfo[0],
        messages,
        participants
      });
      
      // Notify existing participants
      participants.forEach(participant => {
        if (participant.user_id !== inviteeId && onlineUsers.has(participant.user_id)) {
          const participantSocketId = onlineUsers.get(participant.user_id);
          io.to(participantSocketId).emit('user_joined_group', {
            sessionId,
            newUser: { user_id: inviteeId }
          });
        }
      });
    }
  });

  // Leave chat
  socket.on('leave_chat', async (data) => {
    const { sessionId, userId } = data;
    
    const dbaccess = get_db_connection();
    await dbaccess.connect();
    
    // Mark user as left
    await dbaccess.send_sql(
      'UPDATE chat_participants SET left_at = CURRENT_TIMESTAMP WHERE session_id = ? AND user_id = ?',
      [sessionId, userId]
    );
    
    // Check if anyone is still in the chat
    const [remainingParticipants] = await dbaccess.send_sql(
      'SELECT user_id FROM chat_participants WHERE session_id = ? AND left_at IS NULL',
      [sessionId]
    );
    
    if (remainingParticipants.length === 0) {
      // No one left in the chat, can optionally delete or archive it
      console.log(`Chat session ${sessionId} has no active participants`);
    } else {
      // Notify remaining participants
      remainingParticipants.forEach(participant => {
        if (onlineUsers.has(participant.user_id)) {
          const participantSocketId = onlineUsers.get(participant.user_id);
          io.to(participantSocketId).emit('user_left_chat', {
            sessionId,
            userId
          });
        }
      });
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    // Find the userId for this socket
    let disconnectedUserId = null;
    
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        break;
      }
    }
    
    if (disconnectedUserId) {
      console.log(`User ${disconnectedUserId} disconnected`);
      onlineUsers.delete(disconnectedUserId);
      
      // Notify friends that this user is offline
      notifyFriendsOfOnlineStatus(disconnectedUserId, false);
    } else {
      console.log(`Socket ${socket.id} disconnected without associated user`);
    }
  });
});

// Helper function to notify friends of a user's online status
async function notifyFriendsOfOnlineStatus(userId, isOnline) {
  try {
    const dbaccess = get_db_connection();
    await dbaccess.connect();
    
    // Get user's linked_nconst
    const [userInfo] = await dbaccess.send_sql(
      'SELECT linked_nconst FROM users WHERE user_id = ?',
      [userId]
    );
    
    if (userInfo.length === 0) return;
    
    const userNconst = userInfo[0].linked_nconst;
    
    // Get user's friends
    const [friends] = await dbaccess.send_sql(`
      SELECT u.user_id
      FROM users u
      JOIN friends f ON u.linked_nconst = f.followed
      WHERE f.follower = ?
    `, [userNconst]);
    
    // Notify each online friend
    friends.forEach(friend => {
      if (onlineUsers.has(friend.user_id)) {
        const friendSocketId = onlineUsers.get(friend.user_id);
        io.to(friendSocketId).emit('friend_status_change', {
          friendId: userId,
          isOnline
        });
      }
    });
  } catch (error) {
    console.error('Error notifying friends of status change:', error);
  }
}

register_routes(app);

// Update database schema for Kafka integration
exec(`node ${path.join(__dirname, 'scripts/update-db-schema.js')}`, (error, stdout, stderr) => {
  if (error) {
    console.error(`Error updating database schema: ${error.message}`);
    return;
  }
  if (stderr) {
    console.error(`Schema update stderr: ${stderr}`);
    return;
  }
  console.log(`Schema update: ${stdout}`);
  
  // Initialize Kafka services after schema update
  initializeKafkaServices().catch(error => {
    console.error('Failed to initialize Kafka services:', error);
    console.log('Server will continue without Kafka integration');
  });
});

server.listen(port, () => {
  console.log(`Main app listening on port ${port}`)
});