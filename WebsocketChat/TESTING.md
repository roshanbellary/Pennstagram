# WebSocket Chat Testing Guide

This document outlines manual test procedures to verify all functionality of the WebSocket chat application.

## Automated Testing

To run the automated tests:

1. Make sure the server is running:
   ```
   npm start
   ```

2. In a separate terminal, run the test script:
   ```
   npm test
   ```

The automated tests simulate multiple users connecting, adding friends, creating chats, and exchanging messages.

## Manual Testing Procedures

For thorough manual testing, you can follow these procedures:

### Setup

1. Start the server:
   ```
   npm start
   ```

2. Open three browser windows/tabs and navigate to `http://localhost:3000` in each.

### Test Case 1: User Registration and Login

1. In each browser, enter a unique username (e.g., "User1", "User2", "User3") and click "Login".
2. **Expected Result**: Each browser should display the main chat interface with the username and generated ID visible.

### Test Case 2: Adding Friends

1. In User1's browser, copy User2's ID (displayed in the welcome message).
2. Go to the Friends tab and paste the ID in the "Friend ID" field.
3. Click "Add".
4. Repeat to add User3 as a friend.
5. In User2's browser, add User3 as a friend.
6. **Expected Result**: 
   - User1's friend list should show User2 and User3.
   - User2's friend list should show User1 and User3.
   - User3's friend list should show User1 and User2.
   - Online status indicators should be green for all users.

### Test Case 3: Direct Chat Invitation and Acceptance

1. In User1's browser, click the "Chat" button next to User2 in the friends list.
2. In User2's browser, note that the "Invites" tab shows a counter badge.
3. Go to the Invites tab and click "Accept" for User1's invite.
4. **Expected Result**: 
   - A chat window should open for both User1 and User2.
   - The chat should be empty initially.

### Test Case 4: Sending and Receiving Messages

1. In User1's browser, type a message and click "Send" or press Enter.
2. **Expected Result**: 
   - The message should appear in both User1's and User2's chat windows.
   - User1's message should be blue and aligned to the right.
   - User2 should see the message in gray and aligned to the left.
3. In User2's browser, respond with a message.
4. **Expected Result**: Both users should see the new message with proper formatting.

### Test Case 5: Direct Chat Invitation and Declination

1. In User2's browser, click the "Chat" button next to User3 in the friends list.
2. In User3's browser, go to Invites tab and click "Decline" for User2's invite.
3. **Expected Result**: 
   - User2 should see a notification that User3 declined the invitation.
   - No chat should be created between User2 and User3.

### Test Case 6: Group Chat Creation

1. In User1's browser, open the chat with User2.
2. Click the "Invite Users" button.
3. In the modal, check the checkbox for User3.
4. Make sure "Create as Group Chat" is checked.
5. Click "Send Invite".
6. In User3's browser, go to Invites tab and click "Accept".
7. **Expected Result**: 
   - A new group chat should be created with all three users.
   - The chat header should show that it's a Group Chat with 3 members.

### Test Case 7: Group Chat Interaction

1. In User1's browser, send a message to the group chat.
2. In User2's browser, send a message to the group chat.
3. In User3's browser, send a message to the group chat.
4. **Expected Result**: 
   - All three users should see all messages in the correct order.
   - Each message should show the sender's name.

### Test Case 8: Leaving a Chat

1. In User3's browser, click the "Leave Chat" button in the group chat.
2. Confirm the action when prompted.
3. In User1's and User2's browsers, send new messages in the group chat.
4. **Expected Result**: 
   - User3 should no longer see the group chat in their chats list.
   - User1 and User2 should see a notification that User3 left the chat.
   - User1 and User2 should still be able to exchange messages.

### Test Case 9: Chat Persistence

1. In User1's browser, refresh the page.
2. Log in with the same username as before.
3. Go to the Chats tab.
4. Click on the previous chats.
5. **Expected Result**: 
   - All previous chats should be available.
   - Chat history should be preserved, showing all previous messages.

### Test Case 10: Unique Group Chat Check

1. In User1's browser, try to create another group chat with exactly the same participants (User2 and User3).
2. **Expected Result**: 
   - An error should indicate that a group chat with these participants already exists.

### Test Case 11: Offline Status and Reconnection

1. Close User2's browser tab completely.
2. **Expected Result**: In User1's and User3's friend lists, User2 should now show as offline.
3. Reopen a browser tab, navigate to the app, and log in as User2 again.
4. **Expected Result**: 
   - In User1's and User3's friend lists, User2 should show as online again.
   - User2 should see all previous chats and messages.

## Test Coverage Matrix

| Feature                  | Test Case Numbers |
|--------------------------|------------------|
| User login               | 1, 11            |
| Adding friends           | 2                |
| Direct chat invite       | 3, 5             |
| Chat messaging           | 4, 7             |
| Group chat creation      | 6                |
| Leaving chat             | 8                |
| Chat persistence         | 9                |
| Duplicate group check    | 10               |
| Online/offline status    | 2, 11            |

## Browser Compatibility

Test the application in at least two different browsers to ensure compatibility:
- Google Chrome
- Mozilla Firefox
- Microsoft Edge
- Safari (if available)

## Mobile Responsiveness

Test the responsive design by:
1. Using browser developer tools to simulate mobile devices
2. Testing on actual mobile devices if available
3. Checking that the layout adapts properly to small screens
4. Verifying that all functionality works on mobile devices 