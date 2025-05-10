import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios, { AxiosError } from 'axios';
import io, { Socket } from 'socket.io-client';
import config from '../config.json';
import Navbar from '../components/Navbar';

interface ChatSession {
  session_id: number;
  name: string;
  created_at: string;
  is_group: boolean;
  participants: { user_id: number; username: string }[];
  lastMessage: {
    content: string;
    sent_at: string;
    sender_username: string;
  } | null;
}

interface Friend {
  user_id: number;
  username: string;
  isOnline?: boolean;
}

const ChatList: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [showNewChatForm, setShowNewChatForm] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<number[]>([]);
  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState('');

  // Connect to the WebSocket server
  useEffect(() => {
    const socketUrl = config.serverURL.replace('/api', '');
    console.log('ChatList: Connecting to WebSocket at:', socketUrl);
    const newSocket = io(socketUrl);
    
    newSocket.on('connect', () => {
      console.log('ChatList: WebSocket connected with ID:', newSocket.id);
    });
    
    newSocket.on('connect_error', (error) => {
      console.error('ChatList: WebSocket connection error:', error);
    });
    
    setSocket(newSocket);

    return () => {
      console.log('ChatList: Disconnecting WebSocket');
      newSocket.disconnect();
    };
  }, []);

  // Get user's chats and friends when component mounts
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get session info to get user ID
        const sessionResponse = await axios.get(`${config.serverURL}/hello`, { withCredentials: true });
        if (sessionResponse.data && sessionResponse.data.user_id) {
          setUserId(sessionResponse.data.user_id);

          // Connect to socket with user ID
          if (socket) {
            socket.emit('user_connected', sessionResponse.data.user_id);
          }
        }

        // Get chats
        const chatsResponse = await axios.get(`${config.serverURL}/chats`, { withCredentials: true });
        setChats(chatsResponse.data.results || []);

        // Get friends
        const friendsResponse = await axios.get(`${config.serverURL}/online-friends`, { withCredentials: true });
        setFriends(friendsResponse.data.friends || []);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to load chats and friends');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [socket, username]);

  // Listen for socket events
  useEffect(() => {
    if (!socket) return;

    // When a friend comes online or goes offline
    socket.on('friend_status_change', (data) => {
      setFriends(prevFriends => 
        prevFriends.map(friend => 
          friend.user_id === data.friendId 
            ? { ...friend, isOnline: data.isOnline } 
            : friend
        )
      );
    });

    // When a chat invite is received
    socket.on('chat_invite', (data) => {
      const confirmed = window.confirm(`${data.senderUsername} wants to chat with you. Accept?`);
      
      if (socket) {
        socket.emit('chat_invite_response', {
          senderId: data.senderId,
          receiverId: userId,
          accepted: confirmed
        });
      }
    });

    // When a chat session is created
    socket.on('chat_session_created', (data) => {
      // Refresh the chats list
      axios.get(`${config.serverURL}/chats`, { withCredentials: true })
        .then(response => setChats(response.data.results || []))
        .catch(error => console.error('Error refreshing chats:', error));
    });

    return () => {
      socket.off('friend_status_change');
      socket.off('chat_invite');
      socket.off('chat_session_created');
    };
  }, [socket, userId]);

  const handleChatClick = async (sessionId: number) => {
    try {
      // Verify the user is logged in before navigating
      const sessionResponse = await axios.get(`${config.serverURL}/hello`, { withCredentials: true });
      
      if (sessionResponse.data && sessionResponse.data.logged_in) {
        // User is logged in, proceed to navigate
        navigate(`/${username}/messages/${sessionId}`);
      } else {
        // User is not logged in, show error
        setError('You must be logged in to access chats');
        
        // Attempt to refresh the session
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (error) {
      console.error('Error checking session:', error);
      setError('Failed to verify login session');
    }
  };

  const handleInviteFriend = (friendId: number) => {
    if (!socket || !userId) return;
    
    const friend = friends.find(f => f.user_id === friendId);
    if (friend) {
      socket.emit('send_chat_invite', {
        senderId: userId,
        receiverId: friendId,
        senderUsername: username
      });
    }
  };

  const toggleFriendSelection = (friendId: number) => {
    setSelectedFriends(prev => 
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  const createGroupChat = async () => {
    if (selectedFriends.length === 0) {
      setError('Please select at least one friend');
      return;
    }

    try {
      console.log('Creating group chat with friends:', selectedFriends);
      
      const response = await axios.post(
        `${config.serverURL}/chat/create-group`,
        {
          name: groupName.trim() || 'Group Chat',
          participant_ids: selectedFriends
        },
        { withCredentials: true }
      );

      if (response.data && response.data.session_id) {
        setShowNewChatForm(false);
        setSelectedFriends([]);
        setGroupName('');
        
        // Refresh chats
        const chatsResponse = await axios.get(`${config.serverURL}/chats`, { withCredentials: true });
        setChats(chatsResponse.data.results || []);
      }
    } catch (error) {
      console.error('Error creating group chat:', error);
      
      // More detailed error logging
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        
        if (axiosError.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          console.error('Error response data:', axiosError.response.data);
          console.error('Error response status:', axiosError.response.status);
          console.error('Error response headers:', axiosError.response.headers);
          
          // Use the server's error message if available
          const responseData = axiosError.response.data as any;
          if (responseData && responseData.error) {
            setError(`Failed to create group chat: ${responseData.error}`);
          } else {
            setError(`Failed to create group chat: Server returned ${axiosError.response.status}`);
          }
        } else if (axiosError.request) {
          // The request was made but no response was received
          console.error('Error request:', axiosError.request);
          setError('Failed to create group chat: No response from server');
        } else {
          // Something happened in setting up the request that triggered an Error
          console.error('Error message:', axiosError.message);
          setError(`Failed to create group chat: ${axiosError.message}`);
        }
      } else {
        // Handle non-Axios errors
        const genericError = error as Error;
        setError(`Failed to create group chat: ${genericError.message}`);
      }
    }
  };

  // Format date to display in a user-friendly way
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'long' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar username={username || ''} />
        <div className="max-w-4xl mx-auto pt-20 px-4">
          <div className="text-center py-10">
            <div className="spinner"></div>
            <p className="mt-4 text-gray-600">Loading chats...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar username={username || ''} />
      
      <div className="max-w-4xl mx-auto pt-20 px-4">
        <div className="bg-white rounded-lg shadow">
          <div className="border-b p-4 flex justify-between items-center">
            <h1 className="text-xl font-semibold">Messages</h1>
            <button 
              onClick={() => setShowNewChatForm(!showNewChatForm)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              {showNewChatForm ? 'Cancel' : 'New Chat'}
            </button>
          </div>
          
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
              <span className="block sm:inline">{error}</span>
              <span className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setError('')}>
                <svg className="fill-current h-6 w-6 text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
              </span>
            </div>
          )}
          
          {showNewChatForm ? (
            <div className="p-4">
              <h2 className="text-lg font-medium mb-4">Create a New Chat</h2>
              
              <div className="mb-4">
                <label htmlFor="groupName" className="block text-sm font-medium text-gray-700">Group Name (optional)</label>
                <input
                  type="text"
                  id="groupName"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                  placeholder="Enter group name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </div>
              
              <h3 className="font-medium text-gray-700 mb-2">Select friends to add:</h3>
              <div className="max-h-64 overflow-y-auto border rounded-md p-2">
                {friends.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No friends found</p>
                ) : (
                  friends.map(friend => (
                    <div 
                      key={friend.user_id}
                      className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer"
                      onClick={() => toggleFriendSelection(friend.user_id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFriends.includes(friend.user_id)}
                        onChange={() => {}}
                        className="h-4 w-4 text-indigo-600"
                      />
                      <span className="ml-2">{friend.username}</span>
                      {friend.isOnline && <span className="ml-2 w-2 h-2 bg-green-500 rounded-full"></span>}
                    </div>
                  ))
                )}
              </div>
              
              <div className="mt-4 flex justify-end">
                <button
                  onClick={createGroupChat}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                  disabled={selectedFriends.length === 0}
                >
                  Create Chat
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="divide-y">
                {chats.length === 0 ? (
                  <div className="py-8 text-center text-gray-500">
                    <p>No chats yet</p>
                    <p className="mt-2 text-sm">Start by inviting a friend to chat</p>
                  </div>
                ) : (
                  chats.map(chat => (
                    <div 
                      key={chat.session_id}
                      className="p-4 flex items-center hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleChatClick(chat.session_id)}
                    >
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                          <span className="text-indigo-800 font-medium">
                            {chat.is_group ? 'G' : chat.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4 flex-1">
                        <div className="flex justify-between">
                          <h3 className="font-medium">{chat.name}</h3>
                          {chat.lastMessage && (
                            <span className="text-sm text-gray-500">
                              {formatDate(chat.lastMessage.sent_at)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 truncate">
                          {chat.lastMessage 
                            ? `${chat.lastMessage.sender_username}: ${chat.lastMessage.content}` 
                            : 'No messages yet'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="border-t p-4">
                <h2 className="font-medium mb-3">Online Friends</h2>
                <div className="space-y-2">
                  {friends.filter(f => f.isOnline).length === 0 ? (
                    <p className="text-gray-500 text-sm">No friends online</p>
                  ) : (
                    friends
                      .filter(f => f.isOnline)
                      .map(friend => (
                        <div 
                          key={friend.user_id}
                          className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50"
                        >
                          <div className="flex items-center">
                            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                            <span className="ml-2">{friend.username}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInviteFriend(friend.user_id);
                            }}
                            className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-md hover:bg-indigo-200 text-sm"
                          >
                            Invite to Chat
                          </button>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatList; 