import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import io, { Socket } from 'socket.io-client';
import config from '../config.json';
import Navbar from '../components/Navbar';

interface Message {
  message_id: number;
  content: string;
  sent_at: string;
  sender_id: number;
  sender_username: string;
  session_id: number;
}

interface Participant {
  user_id: number;
  username: string;
}

interface ChatSession {
  session_id: number;
  name: string;
  created_at: string;
  is_group: boolean;
}

interface ChatInvite {
  senderId: number;
  senderUsername: string;
}

const ChatMessages: React.FC = () => {
  const { username = '', sessionId } = useParams<{ username: string; sessionId: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [input, setInput] = useState('');
  const [userId, setUserId] = useState<number | null>(null);
  const [sessionInfo, setSessionInfo] = useState<ChatSession | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showParticipants, setShowParticipants] = useState(false);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [availableFriends, setAvailableFriends] = useState<Participant[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<number | null>(null);
  const [pendingInvites, setPendingInvites] = useState<ChatInvite[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Get user ID from session
        const sessionResponse = await axios.get(`${config.serverURL}/hello`, { withCredentials: true });
        
        if (sessionResponse.data && sessionResponse.data.logged_in && sessionResponse.data.user_id) {
          setUserId(sessionResponse.data.user_id);
          
          // Connect to socket with user ID if it exists
          if (socket) {
            console.log('Emitting user_connected event with user ID:', sessionResponse.data.user_id);
            socket.emit('user_connected', sessionResponse.data.user_id);
          }
        } else {
          console.warn('User not logged in or session not found');
          // Don't set error here - let's try to get chat data anyway and only show error if that fails
        }
        
        // Get chat data if sessionId exists
        if (sessionId) {
          try {
            const chatResponse = await axios.get(
              `${config.serverURL}/chat/${sessionId}`,
              { withCredentials: true }
            );
            
            if (chatResponse.status === 200) {
              setSessionInfo(chatResponse.data.session);
              setMessages(chatResponse.data.messages || []);
              setParticipants(chatResponse.data.participants || []);
              
              // If we got here, then we're authenticated, so clear any previous error
              setError('');
              
              // Get available friends for adding to group chat
              if (chatResponse.data.session && chatResponse.data.session.is_group) {
                const friendsResponse = await axios.get(
                  `${config.serverURL}/online-friends`,
                  { withCredentials: true }
                );
                
                // Filter out friends who are already in the chat
                if (friendsResponse.data && friendsResponse.data.friends) {
                  const participantIds = chatResponse.data.participants.map((p: Participant) => p.user_id);
                  const availableFriends = friendsResponse.data.friends.filter(
                    (f: Participant) => !participantIds.includes(f.user_id)
                  );
                  
                  setAvailableFriends(availableFriends);
                }
              }
            }
          } catch (chatError: any) {
            console.error('Error fetching chat data:', chatError);
            
            // Only show the login error if we get a 403 status (not logged in)
            if (chatError.response && chatError.response.status === 403) {
              setError('You must be logged in to access chats');
            } else {
              setError('Failed to load chat: ' + (chatError.response?.data?.error || 'Unknown error'));
            }
          }
        }
      } catch (error: any) {
        console.error('Error fetching initial data:', error);
        
        // Be more specific about the error
        if (error.response && error.response.status === 403) {
          setError('You must be logged in to access chats');
        } else {
          setError('Failed to load user data: ' + (error.message || 'Unknown error'));
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [sessionId, socket, username]);
  
  // Connect socket when component mounts
  useEffect(() => {
    const socketUrl = config.serverURL.replace('/api', '');
    console.log('Connecting to WebSocket at:', socketUrl);
    
    const newSocket = io(socketUrl);
    
    newSocket.on('connect', () => {
      console.log('WebSocket connected with ID:', newSocket.id);
    });
    
    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setError('Failed to connect to chat server');
    });
    
    setSocket(newSocket);
    
    return () => {
      console.log('Disconnecting WebSocket');
      newSocket.disconnect();
    };
  }, []);  // Empty dependency array so it only runs once
  
  // Scroll to bottom when messages change
  useEffect(() => {
    console.log('Messages updated, scrolling to bottom');
    // Use a small timeout to ensure the DOM has been updated
    const scrollTimeout = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    
    return () => clearTimeout(scrollTimeout);
  }, [messages]);
  
  // Auto-reconnect if socket disconnects
  useEffect(() => {
    if (!socket) return;
    
    const handleDisconnect = () => {
      console.log('Socket disconnected, attempting to reconnect');
      
      // Wait a bit and then try to reconnect
      setTimeout(() => {
        if (socket && !socket.connected) {
          console.log('Attempting to reconnect socket');
          socket.connect();
        }
      }, 2000);
    };
    
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      handleDisconnect();
    });
    
    return () => {
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error');
    };
  }, [socket]);
  
  // Socket event listeners
  useEffect(() => {
    if (!socket || !userId) return;
    
    console.log('Setting up socket event listeners', { userId, hasSessionId: !!sessionId });
    
    // Listen for chat invites
    socket.on('chat_invite', (invite: ChatInvite) => {
      console.log('Received chat invite from:', invite.senderUsername);
      setPendingInvites(prev => [...prev, invite]);
      
      // Show notification to user
      try {
        const notification = new Notification(`Chat Invite from ${invite.senderUsername}`, {
          body: 'Click to accept or decline',
        });
        
        notification.onclick = () => {
          window.focus();
        };
      } catch (error) {
        console.error('Failed to show notification:', error);
        // Continue without notification if it fails
      }
    });
    
    // Listen for chat session creation after accepting an invite
    socket.on('chat_session_created', (data) => {
      console.log('Chat session created:', data);
      // Navigate to the new chat session
      navigate(`/${username}/chat/${data.sessionId}`);
    });
    
    // Listen for declined invites
    socket.on('chat_invite_declined', (data) => {
      console.log('Chat invite declined by:', data.receiverId);
      // Could show a notification to the user
    });
    
    // Listen for new messages
    socket.on('receive_message', (message) => {
      console.log('Received message from socket:', message);
      if (sessionId && message.session_id === Number(sessionId)) {
        console.log('Adding message to state:', message);
        
        setMessages(prev => {
          // Check if this message is already in our list (to prevent duplicates)
          const exists = prev.some(m => m.message_id === message.message_id);
          if (exists) {
            console.log('Message already exists, not adding duplicates');
            return prev;
          }
          
          const newMessages = [...prev, message];
          console.log('New messages state length:', newMessages.length);
          
          // Force scroll to bottom
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
          
          return newMessages;
        });
      } else {
        console.log(
          'Ignoring message for different session', 
          { messageSessionId: message.session_id, currentSessionId: sessionId }
        );
      }
    });
    
    // Reconnect handling
    socket.on('reconnect', () => {
      console.log('Socket reconnected, re-establishing connection');
      
      // Re-emit user_connected to ensure server knows we're online
      if (userId) {
        socket.emit('user_connected', userId);
      }
    });
    
    // Listen for user joining group
    socket.on('user_joined_group', async (data) => {
      console.log('User joined group:', data);
      if (sessionId && data.sessionId === Number(sessionId)) {
        // Refresh participants
        try {
          const response = await axios.get(
            `${config.serverURL}/chat/${sessionId}/participants`,
            { withCredentials: true }
          );
          setParticipants(response.data.participants);
          
          // Update available friends
          const friendsResponse = await axios.get(
            `${config.serverURL}/online-friends`,
            { withCredentials: true }
          );
          
          const participantIds = response.data.participants.map((p: Participant) => p.user_id);
          const availableFriends = friendsResponse.data.friends.filter(
            (f: Participant) => !participantIds.includes(f.user_id)
          );
          
          setAvailableFriends(availableFriends);
        } catch (error) {
          console.error('Error refreshing participants:', error);
        }
      }
    });
    
    // Listen for user leaving chat
    socket.on('user_left_chat', (data) => {
      console.log('User left chat:', data);
      if (sessionId && data.sessionId === Number(sessionId)) {
        setParticipants(prev => prev.filter(p => p.user_id !== data.userId));
      }
    });
    
    // Ping the server every 30 seconds to keep the connection alive
    const pingInterval = setInterval(() => {
      if (socket && socket.connected) {
        console.log('Sending ping to keep socket connection alive');
        socket.emit('ping');
      }
    }, 30000);
    
    return () => {
      console.log('Cleaning up socket event listeners');
      clearInterval(pingInterval);
      socket.off('chat_invite');
      socket.off('chat_session_created');
      socket.off('chat_invite_declined');
      socket.off('receive_message');
      socket.off('reconnect');
      socket.off('user_joined_group');
      socket.off('user_left_chat');
    };
  }, [socket, sessionId, userId, username, navigate]);
  
  const sendMessage = () => {
    // Add more detailed debugging
    console.log('Send button clicked');
    console.log('Socket status:', socket ? 'exists' : 'null');
    console.log('SessionId:', sessionId);
    console.log('UserId:', userId);
    
    if (!input.trim() || !socket || !userId || !sessionId) {
      console.log('Cannot send message, missing data:', { 
        hasInput: !!input.trim(), 
        hasSocket: !!socket, 
        userId, 
        sessionId 
      });
      return;
    }
    
    const messageData = {
      sessionId: Number(sessionId),
      senderId: userId,
      content: input.trim()
    };
    
    console.log('Sending message:', messageData);
    
    try {
      // Find current user's username
      const currentUserInfo = participants.find(p => p.user_id === userId);
      const senderUsername = currentUserInfo?.username || username || 'You';
      
      // Store the current input before clearing it
      const messageContent = input.trim();
      
      // Clear input field immediately for better UX
      setInput('');
      
      // Optimistically add the message to the UI
      // This will make the UI feel more responsive
      const tempMessage: Message = {
        message_id: Date.now(), // Temporary ID
        content: messageContent,
        sent_at: new Date().toISOString(),
        sender_id: userId,
        sender_username: senderUsername,
        session_id: Number(sessionId)
      };
      
      console.log('Adding optimistic message:', tempMessage);
      
      
      // Force scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
      
      // Emit message to server after UI is updated
      socket.emit('send_message', messageData, (ack: any) => {
        console.log('Message acknowledged by server:', ack);
      });
      // Update messages state
      //setMessages(prev => [...prev, tempMessage]);
      
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    }
  };
  
  const leaveChat = () => {
    // Add more detailed debugging
    console.log('Leave button clicked');
    console.log('Socket status:', socket ? 'exists' : 'null');
    console.log('SessionId:', sessionId);
    console.log('UserId:', userId);
    
    if (!socket || !userId || !sessionId) {
      console.error('Cannot leave chat, missing data', { hasSocket: !!socket, userId, sessionId });
      return;
    }
    
    const confirmed = window.confirm('Are you sure you want to leave this chat?');
    if (confirmed) {
      try {
        const leaveData = {
          sessionId: Number(sessionId),
          userId
        };
        
        console.log('Leaving chat with data:', leaveData);
        
        // Emit leave_chat event to server
        socket.emit('leave_chat', leaveData);
        
        // Wait a brief moment to allow the server to process
        setTimeout(() => {
          // Navigate back to chat list
          navigate(`/${username}/chats`);
        }, 300);
      } catch (error) {
        console.error('Error leaving chat:', error);
        alert('Failed to leave chat. Please try again.');
      }
    }
  };
  
  const inviteToGroup = () => {
    if (!socket || !userId || !sessionId || !selectedFriend) return;
    
    socket.emit('invite_to_group', {
      sessionId: Number(sessionId),
      inviterId: userId,
      inviteeId: selectedFriend
    });
    
    setShowAddParticipant(false);
    setSelectedFriend(null);
  };
  
  const respondToInvite = (invite: ChatInvite, accept: boolean) => {
    if (!socket || !userId) return;
    
    socket.emit('chat_invite_response', {
      senderId: invite.senderId,
      receiverId: userId,
      accepted: accept
    });
    
    // Remove the invite from pending list
    setPendingInvites(prev => prev.filter(i => i.senderId !== invite.senderId));
  };
  
  // Format timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // Format date for message groups
  const formatMessageDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };
  
  // Group messages by date
  const messagesByDate = messages.reduce<{ [date: string]: Message[] }>((groups, message) => {
    const date = formatMessageDate(message.sent_at);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {});
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar username={username || ''} />
        <div className="max-w-4xl mx-auto pt-20 px-4">
          <div className="text-center py-10">
            <div className="spinner"></div>
            <p className="mt-4 text-gray-600">Loading chat...</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar username={username || ''} />
        <div className="max-w-4xl mx-auto pt-20 px-4">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Error!</strong>
            <span className="block sm:inline"> {error}</span>
          </div>
          <div className="mt-4">
            <button
              onClick={() => navigate(`/${username}/chats`)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              Back to Chats
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar username={username || ''} />
      
      {/* Chat Invites Dialog */}
      {pendingInvites.length > 0 && (
        <div className="fixed top-20 right-4 z-10 w-80 bg-white shadow-lg rounded-lg border">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-lg">Chat Invites</h3>
          </div>
          {pendingInvites.map((invite, index) => (
            <div key={index} className="p-4 border-b">
              <p className="mb-2"><strong>{invite.senderUsername}</strong> invited you to chat</p>
              <div className="flex space-x-2">
                <button 
                  onClick={() => respondToInvite(invite, true)}
                  className="px-3 py-1 bg-green-100 text-green-800 rounded-md hover:bg-green-200"
                >
                  Accept
                </button>
                <button 
                  onClick={() => respondToInvite(invite, false)}
                  className="px-3 py-1 bg-red-100 text-red-800 rounded-md hover:bg-red-200"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {sessionId ? (
        <div className="max-w-4xl mx-auto pt-20 px-4 flex flex-col h-[calc(100vh-80px)]">
          <div className="bg-white rounded-t-lg shadow border p-4 flex justify-between items-center">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                <span className="text-indigo-800 font-medium">
                  {sessionInfo?.is_group ? 'G' : participants[0]?.username.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="ml-3">
                <h1 className="text-lg font-semibold">
                  {sessionInfo?.is_group 
                    ? (sessionInfo.name || 'Group Chat') 
                    : participants.find(p => p.user_id !== userId)?.username || 'Chat'}
                </h1>
                <p className="text-sm text-gray-500">
                  {participants.length} participant{participants.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            
            <div className="flex space-x-2">
              {sessionInfo?.is_group && (
                <button
                  onClick={() => setShowAddParticipant(!showAddParticipant)}
                  className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-md hover:bg-indigo-200 text-sm"
                >
                  Add Person
                </button>
              )}
              <button
                onClick={() => setShowParticipants(!showParticipants)}
                className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-md hover:bg-indigo-200 text-sm"
              >
                {showParticipants ? 'Hide Members' : 'Show Members'}
              </button>
              <button
                onClick={leaveChat}
                className="px-3 py-1 bg-red-100 text-red-800 rounded-md hover:bg-red-200 text-sm"
              >
                Leave Chat
              </button>
            </div>
          </div>
          
          {showAddParticipant && (
            <div className="bg-white border-x border-b p-4">
              <h3 className="font-medium mb-2">Add a friend to this group:</h3>
              {availableFriends.length === 0 ? (
                <p className="text-gray-500">No friends available to add</p>
              ) : (
                <>
                  <select
                    className="block w-full p-2 border rounded-md mb-3"
                    value={selectedFriend || ''}
                    onChange={(e) => setSelectedFriend(Number(e.target.value))}
                  >
                    <option value="">Select a friend</option>
                    {availableFriends.map(friend => (
                      <option key={friend.user_id} value={friend.user_id}>
                        {friend.username}
                      </option>
                    ))}
                  </select>
                  <div className="flex justify-end">
                    <button
                      onClick={inviteToGroup}
                      disabled={!selectedFriend}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Add to Group
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          
          {showParticipants && (
            <div className="bg-white border-x border-b p-4">
              <h3 className="font-medium mb-2">Participants:</h3>
              <div className="max-h-40 overflow-y-auto">
                {participants.map(participant => (
                  <div key={participant.user_id} className="flex items-center py-1">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center mr-2">
                      <span className="text-indigo-800 font-medium">
                        {participant.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span>{participant.username}</span>
                    {participant.user_id === userId && <span className="ml-2 text-xs text-gray-500">(You)</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Messages */}
          <div className="flex-1 bg-white border-x overflow-y-auto p-4">
            {Object.entries(messagesByDate).map(([date, dateMessages]) => (
              <div key={date}>
                <div className="text-center my-4">
                  <span className="px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-500">{date}</span>
                </div>
                
                {dateMessages.map((msg, i) => {
                  const isCurrentUser = msg.sender_id === userId;
                  // Determine if we should show the sender info based on if this is a different sender than the previous message
                  const showSenderInfo = i === 0 || dateMessages[i-1].sender_id !== msg.sender_id;
                  
                  console.log('Rendering message:', {
                    id: msg.message_id,
                    content: msg.content,
                    sender_id: msg.sender_id,
                    sender_username: msg.sender_username,
                    current_user_id: userId,
                    isCurrentUser
                  });
                  
                  return (
                    <div key={msg.message_id} className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-3`}>
                      {!isCurrentUser && showSenderInfo && (
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center mr-2">
                          <span className="text-indigo-800 font-medium">
                            {msg.sender_username?.charAt(0).toUpperCase() || '?'}
                          </span>
                        </div>
                      )}
                      
                      <div className="max-w-[70%]">
                        {showSenderInfo && (
                          <div className={`text-xs ${isCurrentUser ? 'text-gray-500 text-right mr-2' : 'text-gray-500 mb-1 ml-2'}`}>
                            {isCurrentUser ? 'You' : msg.sender_username}
                          </div>
                        )}
                        
                        <div className={`px-4 py-2 rounded-lg ${
                          isCurrentUser 
                            ? 'bg-indigo-600 text-white' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          <p>{msg.content}</p>
                          <div className={`text-xs mt-1 ${isCurrentUser ? 'text-indigo-200' : 'text-gray-500'}`}>
                            {formatTime(msg.sent_at)}
                          </div>
                        </div>
                      </div>
                      
                      {isCurrentUser && showSenderInfo && (
                        <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center ml-2">
                          <span className="text-white font-medium">
                            {username?.charAt(0).toUpperCase() || 'Y'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Input */}
          <div className="flex p-3 bg-white rounded-b-lg shadow border">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message..."
              className="flex-1 border rounded-md p-2"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className="ml-2 px-4 py-2 rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto pt-20 px-4">
          <div className="bg-white p-6 rounded-lg shadow text-center">
            <p className="text-lg text-gray-600">No active chat. You can start a chat with a friend or respond to chat invites.</p>
            {pendingInvites.length > 0 && (
              <p className="mt-2 text-indigo-600">You have {pendingInvites.length} pending chat invite(s).</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatMessages; 