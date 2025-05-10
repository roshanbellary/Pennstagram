# WebSocket Chat Demo

A real-time chat application using Socket.IO that supports direct messaging, group chats, chat invites, and persistent chat history.

## Features

- **Real-time messaging** using WebSockets with Socket.IO
- **Friend management** - add friends and see online status
- **Chat invitations** - invite friends to chat sessions
- **Group chat** - create multi-user chat rooms
- **Chat persistence** - chat history is preserved
- **Leave chat functionality** - users can leave chats at any time

## How to Run

1. Install dependencies:
   ```
   npm install
   ```

2. Start the server:
   ```
   npm start
   ```
   
   Or for development with automatic reloading:
   ```
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:3000`

## How to Use

1. **Login**:
   - Enter your username and click "Login"
   - The system will generate a unique ID for you (visible in the UI)

2. **Add Friends**:
   - Go to the Friends tab
   - Enter a friend's ID in the input field and click "Add"
   - Both users will now be friends and can see each other's online status

3. **Start a Direct Chat**:
   - Click on the "Chat" button next to an online friend in your friends list
   - A chat invitation will be sent to your friend
   - If they accept, a chat session will be created

4. **Respond to Chat Invites**:
   - Go to the Invites tab (it shows a count of pending invites)
   - Click "Accept" or "Decline" for each invite
   - Accepting opens the chat immediately

5. **Start a Group Chat**:
   - Inside an active chat, click the "Invite Users" button
   - Select multiple friends to invite
   - Check the "Create as Group Chat" checkbox (automatically checked if selecting multiple friends)
   - Click "Send Invite"
   - A new independent chat session will be created when friends accept

6. **Send Messages**:
   - Type your message in the input field at the bottom of the chat
   - Press Enter or click Send
   - All participants will see the message in real-time

7. **Leave a Chat**:
   - Click the "Leave Chat" button in the chat header
   - The chat continues for other participants
   - If the last participant leaves, the chat is deleted

## Testing

### Automated Tests

This project includes automated tests that simulate multiple users interacting with the chat system. To run the tests:

1. First, make sure the server is running:
   ```
   npm start
   ```

2. In a separate terminal, run the test script:
   ```
   npm test
   ```

The automated tests cover:
- User connections and login
- Adding friends
- Direct chat invitations (accept and decline)
- Group chat creation
- Sending and receiving messages
- Leaving chats

### Manual Testing

For comprehensive manual testing procedures, see the [TESTING.md](TESTING.md) file.

## Implementation Notes

- The application uses in-memory storage for simplicity (no database)
- User data and chat history are lost when the server restarts
- Users are identified by auto-generated IDs in this demo
- Messages are ordered by timestamps 