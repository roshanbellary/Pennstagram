import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SignUp from './pages/SignUp';
import Login from './pages/Login';
import Friends from './pages/Friends';
import Home from './pages/Home';
import ChatInterface from './pages/ChatInterface';
import Profile from './pages/Profile';

const App: React.FC = () => {
  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/login" element={<Login />} />
          <Route path="/:username/friends" element={<Friends />} />
          <Route path="/:username/home" element={<Home />} />
          <Route path="/:username/chat" element={<ChatInterface />} />
          <Route path="/profile/:username" element={<Profile />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App; 