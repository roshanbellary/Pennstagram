import React, { useState } from 'react';
import axios from 'axios';
import config from '../config.json';

interface Comment {
  post_id: number;
  username: string;
  title: string | null;
  content: string | null;
  image_url: string | null;
  hashtags: string | null;
  created_at: string;
  author_id: number;
}

interface PostProps {
  username: string;
  title: string | null;
  content: string | null;
  image_url: string | null;
  hashtags: string | null;
  post_id: number;
  parent_post: number | null;
  created_at: string;
  comments?: Comment[];
  onCommentAdded?: () => void;
}

const PostComponent: React.FC<PostProps> = ({ 
  username, 
  title, 
  content, 
  image_url,
  hashtags,
  post_id, 
  parent_post,
  created_at,
  comments = [],
  onCommentAdded
}) => {
  const [showComments, setShowComments] = useState(false);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [commentContent, setCommentContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!commentContent.trim()) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      await axios.post(`${config.serverURL}/${username}/createPost`, {
        content: commentContent,
        parent_id: post_id
      }, {
        withCredentials: true
      });
      
      setCommentContent('');
      setShowCommentForm(false);
      
      if (onCommentAdded) {
        onCommentAdded();
      }
    } catch (err) {
      console.error('Error adding comment:', err);
      setError('Failed to add comment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  const displayHashtags = hashtags ? hashtags.split(' ').map((hash) => hash.startsWith('#')? hash: "#"+hash) : [];
  return (
    <div className="border rounded-lg overflow-hidden bg-white mb-4 shadow">
      {/* Post header */}
      <div className="flex items-center p-3 border-b">
        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white">
          {username.charAt(0).toUpperCase()}
        </div>
        <div className="ml-3">
          <div className="font-semibold">{username}</div>
          <div className="text-xs text-gray-500">{formatDate(created_at)}</div>
        </div>
      </div>

      {/* Post content */}
      <div className="p-3">
        {title && <h3 className="font-bold text-lg mb-2">{title}</h3>}
        
        {content && <p className="text-gray-700 break-words mb-3">{content}</p>}
        
        {image_url && (
          <div className="mb-3">
            <img 
              src={image_url} 
              alt="Post image" 
              className="w-full rounded-lg" 
            />
          </div>
        )}
        
        {displayHashtags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {displayHashtags.map((tag, index) => (
              <span key={index} className="bg-gray-100 text-blue-500 px-2 py-1 rounded-full text-sm">
                {tag}
              </span>
            ))}
          </div>
        )}
        
        {parent_post && (
          <div className="mt-3 text-sm text-gray-500">
            Reply to post #{parent_post}
          </div>
        )}
      </div>
      
      {/* Post actions */}
      <div className="flex border-t p-3 text-gray-500">
        <button className="mr-4 flex items-center">
          <svg className="w-6 h-6 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
          </svg>
          Like
        </button>
        <button 
          className="flex items-center"
          onClick={() => {
            setShowComments(!showComments);
            setShowCommentForm(false);
          }}
        >
          <svg className="w-6 h-6 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
          </svg>
          {comments.length > 0 ? `Comments (${comments.length})` : 'Comment'}
        </button>
      </div>
      
      {/* Comments section */}
      {showComments && (
        <div className="border-t bg-gray-50">
          {comments.length > 0 ? (
            <div className="p-3 space-y-3">
              {comments.map(comment => (
                <div key={comment.post_id} className="bg-white p-3 rounded-lg shadow-sm">
                  <div className="flex items-center mb-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs">
                      {comment.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="ml-2 text-sm font-medium">{comment.username}</div>
                    <div className="ml-2 text-xs text-gray-500">{formatDate(comment.created_at)}</div>
                  </div>
                  {comment.content && <p className="text-sm">{comment.content}</p>}
                  {comment.image_url && (
                    <img 
                      src={comment.image_url} 
                      alt="Comment image" 
                      className="mt-2 max-h-40 rounded" 
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500">No comments yet</div>
          )}
          
          <div className="p-3 border-t">
            {!showCommentForm ? (
              <button 
                className="w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700 font-medium text-sm"
                onClick={() => setShowCommentForm(true)}
              >
                Add a comment...
              </button>
            ) : (
              <form onSubmit={handleCommentSubmit} className="space-y-2">
                <textarea 
                  className="w-full p-2 border rounded-md focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Write a comment..."
                  rows={2}
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  disabled={isSubmitting}
                />
                {error && <p className="text-red-500 text-xs">{error}</p>}
                <div className="flex justify-end space-x-2">
                  <button 
                    type="button"
                    className="px-3 py-1 text-sm border rounded-md"
                    onClick={() => {
                      setShowCommentForm(false);
                      setCommentContent('');
                      setError(null);
                    }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-3 py-1 text-sm bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md disabled:opacity-50"
                    disabled={isSubmitting || !commentContent.trim()}
                  >
                    {isSubmitting ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PostComponent; 