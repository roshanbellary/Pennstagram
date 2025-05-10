const io = require('socket.io-client');
const readline = require('readline');
const colors = require('colors');

// Configuration
const SERVER_URL = 'http://localhost:3000';
const TEST_USERS = [
  { username: 'Alice', color: 'cyan' },
  { username: 'Bob', color: 'yellow' },
  { username: 'Charlie', color: 'green' }
];

// Test state
const clients = new Map(); // username -> {socket, userId, friends, chats}
let currentTest = '';
let testsPassed = 0;
let testsFailed = 0;

// Helper functions
function log(username, message) {
  const userColor = TEST_USERS.find(u => u.username === username)?.color || 'white';
  console.log(`[${username.padEnd(10)}] ${colors[userColor](message)}`);
}

function logTest(message) {
  console.log('\n' + colors.magenta.bold(`=== ${message} ===`));
  currentTest = message;
}

function logSuccess(message) {
  console.log(colors.green(`✓ ${message}`));
  testsPassed++;
}

function logFailure(message, error = null) {
  console.log(colors.red(`✗ ${message}`));
  if (error) console.log(colors.red(`  Error: ${error.message || error}`));
  testsFailed++;
}

function createPromise(socket, eventName, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${eventName}`));
    }, timeout);

    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectUser(username) {
  logTest(`Connecting user: ${username}`);
  
  try {
    const socket = io(SERVER_URL);
    
    // Handle connection
    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        log(username, `Connected with socket ID: ${socket.id}`);
        resolve();
      });
      
      socket.on('connect_error', (error) => {
        reject(new Error(`Connection failed: ${error.message}`));
      });
      
      // Add timeout
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    
    // Login
    const userId = `test_${username.toLowerCase()}_${Date.now()}`;
    
    const loginResponse = await new Promise((resolve) => {
      socket.emit('login', { userId, username }, (response) => {
        resolve(response);
      });
    });
    
    if (!loginResponse.success) {
      throw new Error(`Login failed: ${loginResponse.message}`);
    }
    
    log(username, `Logged in with user ID: ${userId}`);
    
    // Store client info
    clients.set(username, {
      socket,
      userId,
      friends: [],
      chats: []
    });
    
    logSuccess(`${username} connected and logged in successfully`);
    return userId;
  } catch (error) {
    logFailure(`Failed to connect ${username}`, error);
    throw error;
  }
}

async function disconnectAll() {
  logTest('Disconnecting all users');
  
  for (const [username, client] of clients.entries()) {
    log(username, 'Disconnecting...');
    client.socket.disconnect();
  }
  
  clients.clear();
  logSuccess('All users disconnected');
}

async function addFriend(username1, username2) {
  logTest(`Adding friend: ${username1} adds ${username2}`);
  
  try {
    const client1 = clients.get(username1);
    const client2 = clients.get(username2);
    
    if (!client1 || !client2) {
      throw new Error('One or both users not found');
    }
    
    // Set up friend-added listener for user2
    const friendAddedPromise = createPromise(client2.socket, 'friend-added');
    
    // User1 adds User2
    const addFriendResponse = await new Promise((resolve) => {
      client1.socket.emit('add-friend', { friendId: client2.userId }, (response) => {
        resolve(response);
      });
    });
    
    if (!addFriendResponse.success) {
      throw new Error(`Add friend failed: ${addFriendResponse.message}`);
    }
    
    // Wait for User2 to receive friend-added event
    await friendAddedPromise;
    
    // Get updated friends lists
    client1.friends = await new Promise((resolve) => {
      client1.socket.emit('get-friends', {}, (friendsList) => {
        resolve(friendsList);
      });
    });
    
    client2.friends = await new Promise((resolve) => {
      client2.socket.emit('get-friends', {}, (friendsList) => {
        resolve(friendsList);
      });
    });
    
    // Verify friends were added
    const user1HasUser2 = client1.friends.some(f => f.userId === client2.userId);
    const user2HasUser1 = client2.friends.some(f => f.userId === client1.userId);
    
    if (user1HasUser2 && user2HasUser1) {
      logSuccess(`${username1} and ${username2} are now friends`);
      return true;
    } else {
      throw new Error('Friend relationship not properly established');
    }
  } catch (error) {
    logFailure(`Failed to add friend ${username2} to ${username1}`, error);
    return false;
  }
}

async function inviteToChat(fromUsername, toUsername, isGroup = false) {
  logTest(`${fromUsername} invites ${toUsername} to ${isGroup ? 'group ' : ''}chat`);
  
  try {
    const fromClient = clients.get(fromUsername);
    const toClient = clients.get(toUsername);
    
    if (!fromClient || !toClient) {
      throw new Error('One or both users not found');
    }
    
    // Set up chat-invite listener for recipient
    const chatInvitePromise = createPromise(toClient.socket, 'chat-invite');
    
    // Send invite
    const inviteResponse = await new Promise((resolve) => {
      fromClient.socket.emit('invite-to-chat', {
        friendIds: [toClient.userId],
        groupChat: isGroup
      }, (response) => {
        resolve(response);
      });
    });
    
    if (!inviteResponse.success) {
      throw new Error(`Invite failed: ${inviteResponse.message}`);
    }
    
    // Store chat ID
    const chatId = inviteResponse.chatId;
    log(fromUsername, `Created chat with ID: ${chatId}`);
    
    // Wait for recipient to receive invite
    const inviteData = await chatInvitePromise;
    log(toUsername, `Received chat invite from: ${inviteData.fromName}`);
    
    logSuccess(`${fromUsername} successfully invited ${toUsername} to chat`);
    return chatId;
  } catch (error) {
    logFailure(`Failed to invite ${toUsername} to chat`, error);
    return null;
  }
}

async function respondToInvite(username, chatId, accept) {
  logTest(`${username} ${accept ? 'accepts' : 'declines'} chat invite`);
  
  try {
    const client = clients.get(username);
    
    if (!client) {
      throw new Error('User not found');
    }
    
    const response = await new Promise((resolve) => {
      client.socket.emit('respond-to-invite', {
        chatId,
        accept
      }, (response) => {
        resolve(response);
      });
    });
    
    if (!response.success) {
      throw new Error(`Response to invite failed: ${response.message}`);
    }
    
    if (accept) {
      log(username, `Joined chat: ${chatId}`);
      
      // Store chat in client's chats
      if (response.chat) {
        client.chats.push({
          chatId: response.chat.chatId,
          type: response.chat.type
        });
      }
    } else {
      log(username, `Declined chat: ${chatId}`);
    }
    
    logSuccess(`${username} successfully ${accept ? 'accepted' : 'declined'} the invite`);
    return true;
  } catch (error) {
    logFailure(`Failed to respond to invite`, error);
    return false;
  }
}

async function sendMessage(username, chatId, content) {
  logTest(`${username} sends message to chat ${chatId}`);
  
  try {
    const client = clients.get(username);
    
    if (!client) {
      throw new Error('User not found');
    }
    
    const response = await new Promise((resolve) => {
      client.socket.emit('send-message', {
        chatId,
        content
      }, (response) => {
        resolve(response);
      });
    });
    
    if (!response.success) {
      throw new Error(`Send message failed: ${response.message}`);
    }
    
    log(username, `Sent message: "${content}"`);
    logSuccess(`${username} successfully sent message to chat ${chatId}`);
    return response.message;
  } catch (error) {
    logFailure(`Failed to send message`, error);
    return null;
  }
}

async function leaveChat(username, chatId) {
  logTest(`${username} leaves chat ${chatId}`);
  
  try {
    const client = clients.get(username);
    
    if (!client) {
      throw new Error('User not found');
    }
    
    const response = await new Promise((resolve) => {
      client.socket.emit('leave-chat', {
        chatId
      }, (response) => {
        resolve(response);
      });
    });
    
    if (!response.success) {
      throw new Error(`Leave chat failed: ${response.message}`);
    }
    
    // Remove chat from client's chats
    const chatIndex = client.chats.findIndex(c => c.chatId === chatId);
    if (chatIndex !== -1) {
      client.chats.splice(chatIndex, 1);
    }
    
    log(username, `Left chat: ${chatId}`);
    logSuccess(`${username} successfully left chat ${chatId}`);
    return response.deleted;
  } catch (error) {
    logFailure(`Failed to leave chat`, error);
    return false;
  }
}

async function createGroupChat(fromUsername, toUsernames) {
  logTest(`${fromUsername} creates a group chat with ${toUsernames.join(', ')}`);
  
  try {
    const fromClient = clients.get(fromUsername);
    
    if (!fromClient) {
      throw new Error('User not found');
    }
    
    // Get all recipient user IDs
    const friendIds = [];
    for (const username of toUsernames) {
      const client = clients.get(username);
      if (client) {
        friendIds.push(client.userId);
      } else {
        throw new Error(`User ${username} not found`);
      }
    }
    
    // Send invite
    const inviteResponse = await new Promise((resolve) => {
      fromClient.socket.emit('invite-to-chat', {
        friendIds,
        groupChat: true
      }, (response) => {
        resolve(response);
      });
    });
    
    if (!inviteResponse.success) {
      throw new Error(`Group chat creation failed: ${inviteResponse.message}`);
    }
    
    // Store chat ID
    const chatId = inviteResponse.chatId;
    log(fromUsername, `Created group chat with ID: ${chatId}`);
    
    logSuccess(`${fromUsername} successfully created a group chat`);
    return chatId;
  } catch (error) {
    logFailure(`Failed to create group chat`, error);
    return null;
  }
}

async function verifyMessageReceipt(senderUsername, receiverUsername, chatId, message) {
  logTest(`Verifying ${receiverUsername} received message from ${senderUsername}`);
  
  try {
    const receiverClient = clients.get(receiverUsername);
    
    if (!receiverClient) {
      throw new Error('Receiver not found');
    }
    
    // Set up new-message listener
    const messagePromise = createPromise(receiverClient.socket, 'new-message');
    
    // Wait for new message event
    const messageData = await messagePromise;
    
    if (messageData.chatId === chatId && 
        messageData.message.content === message.content &&
        messageData.message.sender === clients.get(senderUsername).userId) {
      logSuccess(`${receiverUsername} successfully received message from ${senderUsername}`);
      return true;
    } else {
      throw new Error('Message data does not match expected values');
    }
  } catch (error) {
    logFailure(`Failed to verify message receipt`, error);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log(colors.bold('\n=== WEBSOCKET CHAT APPLICATION TESTS ===\n'));

  try {
    // Test 1: Connect all users
    for (const user of TEST_USERS) {
      await connectUser(user.username);
      await wait(500); // Small delay between connections
    }
    
    // Test 2: Add friends
    await addFriend('Alice', 'Bob');
    await addFriend('Alice', 'Charlie');
    await addFriend('Bob', 'Charlie');
    
    // Test 3: Direct chat invite and accept
    const aliceBobChatId = await inviteToChat('Alice', 'Bob');
    if (aliceBobChatId) {
      await respondToInvite('Bob', aliceBobChatId, true);
      
      // Test 4: Send and receive messages
      const message = await sendMessage('Alice', aliceBobChatId, 'Hello Bob, how are you?');
      if (message) {
        await verifyMessageReceipt('Alice', 'Bob', aliceBobChatId, message);
        await sendMessage('Bob', aliceBobChatId, 'I am fine, thanks for asking!');
      }
    }
    
    // Test 5: Direct chat invite and decline
    const bobCharlieChatId = await inviteToChat('Bob', 'Charlie');
    if (bobCharlieChatId) {
      await respondToInvite('Charlie', bobCharlieChatId, false);
    }
    
    // Test 6: Group chat creation and interaction
    const groupChatId = await createGroupChat('Alice', ['Bob', 'Charlie']);
    if (groupChatId) {
      await respondToInvite('Bob', groupChatId, true);
      await respondToInvite('Charlie', groupChatId, true);
      
      const groupMessage = await sendMessage('Alice', groupChatId, 'Welcome to our group chat!');
      await sendMessage('Bob', groupChatId, 'Thanks for inviting us!');
      await sendMessage('Charlie', groupChatId, 'This is great!');
    }
    
    // Test 7: Leave chat
    await leaveChat('Charlie', groupChatId);
    
    // Test 8: Chat persists after user leaves
    await sendMessage('Alice', groupChatId, 'Charlie left, but we can still chat');
    
    // Clean up
    await disconnectAll();
    
    // Report results
    console.log('\n' + colors.bold('=== TEST RESULTS ==='));
    console.log(colors.green(`Tests passed: ${testsPassed}`));
    console.log(colors.red(`Tests failed: ${testsFailed}`));
    console.log(colors.bold(`Total tests: ${testsPassed + testsFailed}`));
    
    if (testsFailed === 0) {
      console.log(colors.green.bold('\n✓ All tests passed!'));
    } else {
      console.log(colors.red.bold(`\n✗ ${testsFailed} test(s) failed.`));
    }
  } catch (error) {
    console.error(colors.red.bold('\nTest execution error:'), error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  // Check if server is running first
  const http = require('http');
  const req = http.get(SERVER_URL, (res) => {
    // Server is running, start tests
    runTests();
  });
  
  req.on('error', (error) => {
    console.error(colors.red.bold('ERROR: Server not running!'));
    console.error(colors.yellow(`Make sure the server is running at ${SERVER_URL} before running tests.`));
    console.error(colors.yellow('Start the server with: npm start'));
    process.exit(1);
  });
}

module.exports = {
  runTests
}; 