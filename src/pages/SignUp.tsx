import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import config from '../config.json';

// Define the type for actorMatch to resolve TS errors
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

const SignUp: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [actorMatches, setActorMatches] = useState<ActorMatch[]>([]);
  const [selectedActorMatch, setSelectedActorMatch] = useState<ActorMatch | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [step, setStep] = useState<'info' | 'actor-selection' | 'complete'>('info');
  const navigate = useNavigate();

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
      setImagePreview(URL.createObjectURL(e.target.files[0]));
    }
  };

  const handleActorSelection = (actor: ActorMatch) => {
    setSelectedActorMatch(actor);
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
        setStep('actor-selection');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert('Passwords do not match!');
      return;
    }
    if (step === 'info') {
      await handleFindActorMatches();
      return;
    }
    if (!selectedActorMatch) {
      alert('Please select an actor match.');
      return;
    }
    setLoading(true);
    try {
      // Proceed with registration
      const response = await axios.post(`${config.serverURL}/register`, {
        username,
        password,
        display_name: displayName || username,
        actor_nconst: selectedActorMatch.nconst || '',
      }, {
        withCredentials: true
      });
      if (response.status === 200) {
        setStep('complete');
        navigate(`/${username}/home`);
      }
    } catch (error) {
      console.error('Registration error:', error);
      alert('Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h1 className="text-center text-3xl font-extrabold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent mb-2">
          Pennstagram
        </h1>
        <h2 className="mt-2 text-center text-lg text-gray-600">
          Sign up to see photos and videos from your friends
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border">
          {step === 'info' && (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                  Username
                </label>
                <div className="mt-1">
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
                  Display Name (optional)
                </label>
                <div className="mt-1">
                  <input
                    id="displayName"
                    name="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="mt-1">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirm Password
                </label>
                <div className="mt-1">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="faceImage" className="block text-sm font-medium text-gray-700">
                  Upload a photo of your face
                </label>
                <div className="mt-1">
                  <input
                    id="faceImage"
                    name="faceImage"
                    type="file"
                    accept="image/*"
                    required
                    onChange={handleImageChange}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                  />
                  {imagePreview && (
                    <img src={imagePreview} alt="Preview" className="mt-2 w-32 h-32 object-cover rounded-full border" />
                  )}
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                >
                  {loading ? 'Processing...' : 'Continue'}
                </button>
              </div>
            </form>
          )}

          {step === 'actor-selection' && (
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
                  onClick={() => setStep('info')}
                  className="inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={loading || !selectedActorMatch}
                  onClick={handleSubmit}
                  className="inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                >
                  {loading ? 'Signing up...' : 'Complete Sign Up'}
                </button>
              </div>
            </div>
          )}

          {step !== 'actor-selection' && (
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Already have an account?</span>
                </div>
              </div>

              <div className="mt-6">
                <Link
                  to="/login"
                  className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                >
                  Log in
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignUp;