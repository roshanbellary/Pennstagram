import * as routes from './routes.js';

export default function register_routes(app) {
    app.get('/hello', routes.getHelloWorld);
    app.post('/login', routes.postLogin);
    app.post('/register', routes.postRegister); 
    app.get('/:username/friends', routes.getFriends);
    app.get('/:username/recommendations', routes.getFriendRecs);
    app.post('/:username/createPost', routes.createPost); 
    app.get('/:username/feed', routes.getFeed); 
    app.post('/:username/movies', routes.getMovie);
    app.get('/searchUsers', routes.searchUsers);
    app.post('/addFriend', routes.addFriend);
    app.get('/post/:post_id', routes.getPost);
    
    // User profile routes
    app.get('/profile/:username', routes.getUserProfile);
    app.post('/updateProfile', routes.updateProfile);
    app.get('/suggestedInterests', routes.getSuggestedInterests);
    
    // Chat routes
    app.get('/chats', routes.getChats);
    app.get('/chat/:session_id', routes.getChatMessages);
    app.post('/chat/create-group', routes.createGroupChat);
    app.get('/chat/:session_id/participants', routes.getChatParticipants);
    app.get('/online-friends', routes.getOnlineFriends);
    app.post('/logout', routes.postLogout);
    
    // Image search and embedding routes
    app.get('/actor/:name/embedding', routes.getActorEmbedding);
    app.post('/similar', routes.getTopKSimilar);
    app.post('/upload', routes.uploadMiddleware, routes.uploadImage);
    app.post('/find-similar', routes.uploadMiddleware, routes.findSimilarFaces);
    app.post('/find-actor-matches', routes.uploadMiddleware, routes.postFindActorMatches);
    
    // LLM database query route
    app.post('/query-database', routes.generateDatabaseQuery);
}