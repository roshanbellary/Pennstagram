import React from 'react';
import { useNavigate } from 'react-router-dom';

interface NavbarProps {
  username: string;
}

const Navbar: React.FC<NavbarProps> = ({ username }) => {
  const navigate = useNavigate();

  const goToFeed = () => {
    navigate(`/${username}/home`);
  };

  const goToFriends = () => {
    navigate(`/${username}/friends`);
  };

  const goToChat = () => {
    navigate(`/${username}/chats`);
  };

  const goToMovieChat = () => {
    navigate(`/${username}/movies`);
  };
  
  const goToProfile = () => {
    navigate(`/profile/${username}`);
  };

  const handleLogout = () => {
    // Call the logout endpoint
    fetch(`/logout`, {
      method: 'POST',
      credentials: 'include'
    })
      .then(() => {
        navigate('/login');
      })
      .catch(error => {
        console.error('Logout failed:', error);
      });
  };

  return (
    <nav className="bg-white border-b p-4 fixed w-full top-0 z-10">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center">
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
            Pennstagram
          </h1>
          <span className="ml-2 text-gray-500">@{username}</span>
        </div>
        
        <div className="flex space-x-4">
          <button 
            onClick={goToFeed}
            className="p-2 hover:bg-gray-100 rounded-full"
            title="Feed"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>
          
          <button 
            onClick={goToFriends}
            className="p-2 hover:bg-gray-100 rounded-full"
            title="Friends"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </button>
          
          <button 
            onClick={goToChat}
            className="p-2 hover:bg-gray-100 rounded-full"
            title="Messages"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </button>
          
          <button 
            onClick={goToMovieChat}
            className="p-2 hover:bg-gray-100 rounded-full"
            title="Movie AI Chat"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
          </button>
          
          <button 
            onClick={goToProfile}
            className="p-2 hover:bg-gray-100 rounded-full"
            title="Profile"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
          
          <button 
            onClick={handleLogout}
            className="p-2 hover:bg-gray-100 rounded-full"
            title="Logout"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;