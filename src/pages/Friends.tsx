import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import config from '../config.json';
import Navbar from '../components/Navbar';
import FriendComponent from '../components/FriendComponent';

interface Friend {
  followed: string;
  primaryName: string;
}

interface Recommendation {
  recommendation: string;
  primaryName: string;
}

interface SearchResult {
  nconst: string;
  primaryName: string;
}

const Friends: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFriendsData = async () => {
    setLoading(true);
    try {
      // Fetch friends
      const friendsResponse = await axios.get(`${config.serverURL}/${username}/friends`, {
        withCredentials: true
      });
      
      // Fetch recommendations
      const recommendationsResponse = await axios.get(`${config.serverURL}/${username}/recommendations`, {
        withCredentials: true
      });
      
      setFriends(friendsResponse.data.results);
      setRecommendations(recommendationsResponse.data.results);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to fetch friends data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (username) {
      fetchFriendsData();
    }
  }, [username]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    
    setSearching(true);
    
    try {
      const response = await axios.get(`${config.serverURL}/searchUsers`, {
        params: { query: searchQuery },
        withCredentials: true
      });
      
      setSearchResults(response.data.results);
    } catch (err) {
      console.error('Error searching users:', err);
      setError('Failed to search users. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleSuccessfulFollow = () => {
    // Refresh friends data after successful follow
    fetchFriendsData();
  };

  if (!username) {
    return <div>Username not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar username={username} />
      
      <div className="max-w-6xl mx-auto pt-20 px-4 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900 mt-8 mb-6">People</h1>
        
        {/* Search section */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
          <h2 className="text-lg font-semibold mb-3">Find Friends</h2>
          <form onSubmit={handleSearch} className="flex">
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 rounded-l-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring focus:ring-purple-200 focus:ring-opacity-50"
            />
            <button
              type="submit"
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-r-md"
              disabled={searching}
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>
          
          {searchResults.length > 0 && (
            <div className="mt-4">
              <h3 className="text-md font-medium mb-2">Search Results</h3>
              <div className="space-y-2">
                {searchResults.map((result) => (
                  <FriendComponent
                    key={result.nconst}
                    name={result.primaryName}
                    nconst={result.nconst}
                    add={true}
                    remove={false}
                    onAddSuccess={handleSuccessfulFollow}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}
        
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Friends Section */}
            <div>
              <h2 className="text-xl font-semibold mb-4 text-gray-700">Your Friends</h2>
              <div className="bg-white rounded-lg shadow-sm border p-4">
                {friends.length === 0 ? (
                  <p className="text-gray-500 text-center py-6">You haven't followed anyone yet</p>
                ) : (
                  <div className="space-y-3">
                    {friends.map((friend) => (
                      <FriendComponent 
                        key={friend.followed} 
                        name={friend.primaryName}
                        nconst={friend.followed}
                        remove={true}
                        add={false}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Recommendations Section */}
            <div>
              <h2 className="text-xl font-semibold mb-4 text-gray-700">Recommended For You</h2>
              <div className="bg-white rounded-lg shadow-sm border p-4">
                {recommendations.length === 0 ? (
                  <p className="text-gray-500 text-center py-6">No recommendations available</p>
                ) : (
                  <div className="space-y-3">
                    {recommendations.map((recommendation) => (
                      <FriendComponent 
                        key={recommendation.recommendation} 
                        name={recommendation.primaryName}
                        nconst={recommendation.recommendation}
                        add={true}
                        remove={false}
                        onAddSuccess={handleSuccessfulFollow}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Friends; 