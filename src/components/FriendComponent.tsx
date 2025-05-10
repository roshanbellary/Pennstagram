import React, { useState } from 'react';
import axios from 'axios';
import config from '../config.json';

interface FriendProps {
  name: string;
  nconst?: string;
  add?: boolean;
  remove?: boolean;
  onAddSuccess?: () => void;
}

const FriendComponent: React.FC<FriendProps> = ({ 
  name, 
  nconst,
  add = false, 
  remove = false,
  onAddSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followed, setFollowed] = useState(false);

  const handleFollow = async () => {
    if (!nconst) return;
    
    setLoading(true);
    setError(null);
    
    try {
      await axios.post(`${config.serverURL}/addFriend`, {
        nconst
      }, {
        withCredentials: true
      });
      
      setFollowed(true);
      if (onAddSuccess) {
        onAddSuccess();
      }
    } catch (err) {
      console.error('Error following user:', err);
      setError('Failed to follow user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-lg bg-white p-3 flex justify-between items-center mb-2 shadow-sm">
      <div className="flex items-center">
        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white mr-3">
          {name.charAt(0).toUpperCase()}
        </div>
        <div>
          <span className="font-semibold">{name}</span>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
      </div>
      <div>
        {add && !followed && (
          <button 
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-1 rounded-md text-sm font-medium disabled:opacity-50"
            onClick={handleFollow}
            disabled={loading}
          >
            {loading ? 'Adding...' : 'Follow'}
          </button>
        )}
        {(followed || remove) && (
          <button className="bg-gray-200 text-gray-700 px-3 py-1 rounded-md text-sm font-medium">
            {followed ? 'Following' : 'Unfollow'}
          </button>
        )}
      </div>
    </div>
  );
};

export default FriendComponent; 