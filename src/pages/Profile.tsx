import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import config from '../config.json';
import Navbar from '../components/Navbar';
import PostComponent from '../components/PostComponent';

interface UserProfile {
  user_id: number;
  username: string;
  linked_nconst: string | null;
  actor_nconst: string | null;
  actor_name: string | null;
}

interface Post {
  post_id: number;
  author_id: number;
  author_username: string;
  content: string;
  title: string | null;
  image_url: string | null;
  created_at: string;
  hashtags: string | null;
  source_site: string | null;
  original_post_id: string | null;
}

interface ActorMatch {
  id: string;
  path?: string;
  nconst?: string;
  score?: number;
  metadata?: {
    primaryName?: string;
    [key: string]: any;
  };
}

const Profile: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [followerCount, setFollowerCount] = useState<number>(0);
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isOwnProfile, setIsOwnProfile] = useState<boolean>(false);
  
  // Edit form states
  const [interests, setInterests] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [actorMatches, setActorMatches] = useState<ActorMatch[]>([]);
  const [selectedActorMatch, setSelectedActorMatch] = useState<ActorMatch | null>(null);
  const [showActorSelection, setShowActorSelection] = useState<boolean>(false);

  useEffect(() => {
    // Get current user from session storage
    const storedUser = sessionStorage.getItem('username');
    if (storedUser) {
      setCurrentUser(storedUser);
      setIsOwnProfile(storedUser === username);
    } else {
      navigate('/login');
      return;
    }

    const fetchProfile = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${config.serverURL}/profile/${username}`, { withCredentials: true });
        
        setUserProfile(response.data.user);
        setPosts(response.data.posts || []);
        setIsFollowing(response.data.is_following);
        setFollowerCount(response.data.follower_count);
        setFollowingCount(response.data.following_count);
        setLoading(false);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load profile');
        setLoading(false);
        
        // If not logged in, redirect to login
        if (err.response?.status === 403) {
          navigate('/login');
        }
      }
    };

    if (username) {
      fetchProfile();
    }
  }, [username, navigate]);


  const handleFollowToggle = async () => {
    try {
      await axios.post(`${config.serverURL}/addFriend`, {
        friend_username: username
      }, { withCredentials: true });
      
      // Update following status and count
      setIsFollowing(!isFollowing);
      setFollowerCount(prev => isFollowing ? prev - 1 : prev + 1);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update follow status');
    }
  };

  const handleEditToggle = () => {
    setIsEditing(!isEditing);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
      setImagePreview(URL.createObjectURL(e.target.files[0]));
    }
  };

  const handleFindActorMatches = async () => {
    if (!imageFile) {
      alert('Please upload an image of your face.');
      return;
    }
    setLoading(true);
    try {
      // Upload image and get similar actors
      const formData = new FormData();
      formData.append('image', imageFile);
      const matchRes = await axios.post(`${config.serverURL}/find-actor-matches?k=5`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        withCredentials: true
      });
      if (matchRes.data && matchRes.data.length > 0) {
        setActorMatches(matchRes.data as ActorMatch[]);
        setSelectedActorMatch(matchRes.data[0] as ActorMatch);
        setShowActorSelection(true);
      } else {
        setActorMatches([]);
        alert('No similar actors found. Please try a different image.');
      }
    } catch (error) {
      console.error('Error finding actor matches:', error);
      alert('Error finding similar actors. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleActorSelection = (actor: ActorMatch) => {
    setSelectedActorMatch(actor);
  };

  const handleInterestToggle = (interest: string) => {
    if (interests.includes(interest)) {
      setInterests(interests.filter(i => i !== interest));
    } else {
      setInterests([...interests, interest]);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setLoading(true);
      const updateData: any = {};

      if (selectedActorMatch && selectedActorMatch.nconst) {
        updateData.actor_nconst = selectedActorMatch.nconst;
      }

      const response = await axios.post(`${config.serverURL}/updateProfile`, updateData, {
        withCredentials: true
      });

      if (response.status === 200) {
        alert('Profile updated successfully!');
        setIsEditing(false);
        // Refresh profile data
        window.location.reload();
      }
    } catch (err: any) {
      console.error('Error updating profile:', err);
      alert(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar username={currentUser} />
        <div className="container mx-auto px-4 py-8">
          <p className="text-center text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar username={currentUser} />
        <div className="container mx-auto px-4 py-8">
          <p className="text-center text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar username={currentUser} />
      <div className="container mx-auto px-4 py-8 mt-16">
        {userProfile && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">{userProfile.username}</h1>
                <div className="flex space-x-4 mt-2">
                  <span className="text-gray-600">
                    <span className="font-semibold">{followerCount}</span> followers
                  </span>
                  <span className="text-gray-600">
                    <span className="font-semibold">{followingCount}</span> following
                  </span>
                </div>
              </div>
              {isOwnProfile ? (
                <button
                  onClick={handleEditToggle}
                  className="px-4 py-2 rounded-md bg-purple-500 text-white"
                >
                  {isEditing ? 'Cancel' : 'Edit Profile'}
                </button>
              ) : (
                <button
                  onClick={handleFollowToggle}
                  className={`px-4 py-2 rounded-md ${isFollowing ? 'bg-gray-200 text-gray-800' : 'bg-blue-500 text-white'}`}
                >
                  {isFollowing ? 'Unfollow' : 'Follow'}
                </button>
              )}
            </div>
            
            {!isEditing ? (
              <div className="mt-6">
                <h2 className="text-lg font-semibold mb-2">Profile Information</h2>
                <div className="bg-gray-50 p-4 rounded-md">
                  <p className="mb-2">
                    <span className="font-medium">User ID:</span> {userProfile.user_id}
                  </p>
                  {userProfile.actor_nconst && (
                    <p className="mb-2">
                      <span className="font-medium">Linked Actor:</span> {userProfile.actor_name || userProfile.actor_nconst}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <h2 className="text-lg font-semibold mb-4">Edit Profile</h2>
                
                {!showActorSelection ? (
                  <div className="space-y-6">                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Interests</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {interests.map((interest) => (
                          <span 
                            key={interest} 
                            onClick={() => handleInterestToggle(interest)}
                            className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full cursor-pointer hover:bg-purple-200"
                          >
                            #{interest} ✓
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Change Actor Association</label>
                      <div className="mt-1">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                        />
                        {imagePreview && (
                          <img src={imagePreview} alt="Preview" className="mt-2 w-32 h-32 object-cover rounded-full border" />
                        )}
                      </div>
                      {imageFile && (
                        <button
                          onClick={handleFindActorMatches}
                          disabled={loading}
                          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                        >
                          {loading ? 'Processing...' : 'Find Actor Matches'}
                        </button>
                      )}
                    </div>
                    
                    <div className="flex justify-end">
                      <button
                        onClick={handleSaveProfile}
                        disabled={loading}
                        className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
                      >
                        {loading ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium text-gray-900">Select your celebrity match</h3>
                    <p className="text-sm text-gray-500">Choose the actor that looks most like you</p>
                    
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {actorMatches.map((actor) => (
                        <div 
                          key={actor.id}
                          onClick={() => handleActorSelection(actor)}
                          className={`relative rounded-lg border p-4 flex flex-col items-center cursor-pointer transition-all ${selectedActorMatch?.id === actor.id ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-500' : 'border-gray-300 hover:border-gray-400'}`}
                        >
                          {actor.path && (
                            <img 
                              src={`${config.serverURL}/${actor.path}`} 
                              alt="Actor" 
                              className="w-24 h-24 rounded-full object-cover border mb-2" 
                            />
                          )}
                          <div className="text-md font-medium text-gray-900">{actor.metadata?.primaryName || actor.nconst}</div>
                          <div className="text-xs text-gray-500">Similarity: {(1 - (actor.score || 0)).toFixed(3)}</div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="flex justify-between mt-6">
                      <button
                        type="button"
                        onClick={() => setShowActorSelection(false)}
                        className="inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        disabled={loading || !selectedActorMatch}
                        onClick={handleSaveProfile}
                        className="inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                      >
                        {loading ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
