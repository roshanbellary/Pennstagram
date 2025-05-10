import { useState, useEffect } from 'react';
import axios from 'axios';
import Post from './Post';

const Feed = () => {
  const [posts, setPosts] = useState([]);
  const [recommendedPosts, setRecommendedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRecommended, setShowRecommended] = useState(false);

  useEffect(() => {
    fetchPosts();
    fetchRecommendedPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const response = await axios.get('/api/posts', { withCredentials: true });
      setPosts(response.data.posts || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching posts:', error);
      setLoading(false);
    }
  };

  const fetchRecommendedPosts = async () => {
    try {
      const response = await axios.get('/api/ranking/recommendations', { withCredentials: true });
      setRecommendedPosts(response.data.recommendations || []);
    } catch (error) {
      console.error('Error fetching recommended posts:', error);
    }
  };

  const triggerAdsorption = async () => {
    try {
      await axios.post('/api/ranking/run-adsorption', {}, { withCredentials: true });
      alert('Adsorption job triggered. Check back in a few minutes for updated recommendations.');
    } catch (error) {
      console.error('Error triggering adsorption job:', error);
      alert('Error triggering adsorption job');
    }
  };

  return (
    <div className="feed">
      <div className="feed-header">
        <h2>Feed</h2>
        <div className="feed-actions">
          <button 
            className={`feed-toggle ${!showRecommended ? 'active' : ''}`}
            onClick={() => setShowRecommended(false)}
          >
            Recent Posts
          </button>
          <button 
            className={`feed-toggle ${showRecommended ? 'active' : ''}`}
            onClick={() => setShowRecommended(true)}
          >
            Recommended
          </button>
          <button 
            className="refresh-button"
            onClick={triggerAdsorption}
            title="Update recommendations"
          >
            Refresh Rankings
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading posts...</div>
      ) : (
        <div className="posts-container">
          {showRecommended ? (
            recommendedPosts.length > 0 ? (
              recommendedPosts.map(post => (
                <Post key={post.post_id} post={post} />
              ))
            ) : (
              <div className="no-posts">
                <p>No recommended posts yet. Try refreshing the rankings or interacting with more posts.</p>
              </div>
            )
          ) : (
            posts.length > 0 ? (
              posts.map(post => (
                <Post key={post.post_id} post={post} />
              ))
            ) : (
              <div className="no-posts">
                <p>No posts to show. Follow some users or add some hashtags to your interests.</p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default Feed; 