import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import config from '../config.json';
import Navbar from '../components/Navbar';
import PostComponent from '../components/PostComponent';

interface Post {
  post_id: number;
  username: string;
  title: string | null;
  content: string | null;
  image_url: string | null;
  hashtags: string | null;
  parent_post: number | null;
  created_at: string;
  author_id: number;
  comments?: any[];
}

const Home: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPost, setNewPost] = useState({
    title: '',
    content: '',
    image_url: '',
    hashtags: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchFeed = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${config.serverURL}/${username}/feed`, {
        withCredentials: true
      });
      setPosts(response.data.results);
      
      // Log recommended posts for debugging
      const recommendedPosts = response.data.results.filter((post: any) => post.is_recommended);
      console.log(`Received ${recommendedPosts.length} recommended posts from adsorption algorithm`);
    } catch (err) {
      console.error('Error fetching feed:', err);
      setError('Failed to load posts. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (username) {
      fetchFeed();
    }
  }, [username]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate that post has either text content or an image
    if ((!newPost.content.trim() && !newPost.image_url.trim())) {
      setError('Post must have either text content or an image.');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await axios.post(`${config.serverURL}/${username}/createPost`, {
        title: newPost.title,
        content: newPost.content,
        image_url: newPost.image_url,
        hashtags: newPost.hashtags
      }, {
        withCredentials: true
      });
      
      // Refetch the feed to include the new post
      await fetchFeed();
      
      // Clear the form
      setNewPost({
        title: '',
        content: '',
        image_url: '',
        hashtags: ''
      });
      
      setError(null);
    } catch (err) {
      console.error('Error creating post:', err);
      setError('Failed to create post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!username) {
    return <div>Username not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar username={username} />
      
      <div className="max-w-2xl mx-auto pt-20 px-4 sm:px-6 lg:px-8">
        <h1 className="sr-only">Feed</h1>
        
        {/* Create Post Form */}
        <div className="bg-white rounded-lg shadow border p-4 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-3">Create a new post</h2>
          <form onSubmit={handleCreatePost}>
            <div className="mb-3">
              <input
                type="text"
                placeholder="Title (optional)"
                value={newPost.title}
                onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div className="mb-3">
              <textarea
                placeholder="What's on your mind? (optional if image provided)"
                rows={3}
                value={newPost.content}
                onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500"
              ></textarea>
            </div>
            <div className="mb-3">
              <input
                type="text"
                placeholder="Image URL (optional if content provided)"
                value={newPost.image_url}
                onChange={(e) => setNewPost({ ...newPost, image_url: e.target.value })}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div className="mb-3">
              <input
                type="text"
                placeholder="Hashtags (optional, e.g. #nature #photography)"
                value={newPost.hashtags}
                onChange={(e) => setNewPost({ ...newPost, hashtags: e.target.value })}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            
            {error && (
              <div className="mb-3 p-2 bg-red-50 text-red-600 rounded border-l-4 border-red-500">
                {error}
              </div>
            )}
            
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting || (!newPost.content.trim() && !newPost.image_url.trim())}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
              >
                {isSubmitting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </form>
        </div>

        {/* Feed */}
        {loading && !posts.length ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
          </div>
        ) : (
          <div>
            {posts.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-6 text-center">
                <p className="text-gray-500">No posts yet. Follow more people or create your first post!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map((post) => (
                  <PostComponent
                    key={post.post_id}
                    username={post.username}
                    title={post.title}
                    content={post.content}
                    image_url={post.image_url}
                    hashtags={post.hashtags}
                    post_id={post.post_id}
                    parent_post={post.parent_post}
                    created_at={post.created_at}
                    comments={post.comments}
                    onCommentAdded={fetchFeed}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Home; 