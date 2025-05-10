// Test script for Socket.io connection
const { io } = require("socket.io-client");

const socket = io("http://localhost:8080");

socket.on("connect", () => {
  console.log("Connected to WebSocket server with ID:", socket.id);
  
  // Simulate user_connected event
  socket.emit("user_connected", 9999);
  
  // Simulate sending a message
  setTimeout(() => {
    console.log("Sending test message");
    socket.emit("send_message", {
      sessionId: 1,
      senderId: 9999,
      content: "Test message from script"
    });
  }, 1000);
});

socket.on("connect_error", (error) => {
  console.error("Connection error:", error);
});

socket.on("receive_message", (message) => {
  console.log("Received message:", message);
});

// Disconnect after 5 seconds
setTimeout(() => {
  console.log("Disconnecting");
  socket.disconnect();
  process.exit(0);
}, 5000); 