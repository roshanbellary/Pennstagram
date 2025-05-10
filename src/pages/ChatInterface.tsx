import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import config from '../config.json';
import Navbar from '../components/Navbar';

interface Message {
  id: number;
  text: string;
  isUser: boolean;
}

const ChatInterface: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, text: "Hi! Ask me anything about movies!", isUser: false }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    // Add user message
    const userMessage = { id: messages.length + 1, text: input, isUser: true };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    
    try {
      // Call the movies endpoint
      const response = await axios.post(`${config.serverURL}/${username}/movies`, {
        question: input
      }, { withCredentials: true });
      
      // Add AI response
      const aiMessage = {
        id: messages.length + 2,
        text: response.data.message,
        isUser: false
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        id: messages.length + 2,
        text: "Sorry, I couldn't process your request.",
        isUser: false
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar username={username || ''} />
      
      <div className="max-w-2xl mx-auto pt-20 px-4 flex flex-col h-[calc(100vh-80px)]">
        <div className="bg-white rounded-t-lg shadow border p-4">
          <h1 className="text-xl font-semibold text-center">Movie Chat</h1>
        </div>
        
        {/* Messages */}
        <div className="flex-1 bg-white border overflow-y-auto p-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'} mb-3`}>
              <div className={`px-4 py-2 rounded-lg ${
                msg.isUser ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' : 'bg-gray-100'
              }`}>
                <p>{msg.text}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-lg bg-gray-100">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"></div>
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"></div>
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Input */}
        <form onSubmit={sendMessage} className="flex p-2 bg-white rounded-b-lg shadow border">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about movies..."
            className="flex-1 border rounded-md p-2"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="ml-2 px-4 py-2 rounded-md text-white bg-gradient-to-r from-purple-600 to-pink-500"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface; 