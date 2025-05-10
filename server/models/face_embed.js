/**
 * Mock implementation of FaceEmbed class for testing without TensorFlow
 */
class FaceEmbed {
  constructor() {
    console.log("Creating mock FaceEmbed instance");
  }

  async loadModel() {
    console.log("Mock: Loading face recognition model");
    return Promise.resolve();
  }

  /**
   * Generate a random embedding vector to simulate face detection
   */
  _generateRandomEmbedding() {
    // Create a random 128-dimensional embedding vector
    return Array.from({ length: 128 }, () => Math.random() * 2 - 1);
  }

  /**
   * Mock implementation that returns 1-3 random embeddings
   */
  async getEmbeddingsFromBuffer(buffer) {
    console.log("Mock: Generating embeddings from buffer");
    // Simulate 1-3 faces in the image
    const faceCount = Math.floor(Math.random() * 3) + 1;
    const embeddings = [];
    
    for (let i = 0; i < faceCount; i++) {
      embeddings.push(this._generateRandomEmbedding());
    }
    
    return embeddings;
  }

  async getEmbeddingsFromPath(path) {
    console.log("Mock: Generating embeddings from path", path);
    return this.getEmbeddingsFromBuffer(null);
  }

  async indexAllFaces(pathName, image, collection) {
    console.log("Mock: Indexing faces for", image);
    const embeddings = await this.getEmbeddingsFromPath(pathName);
    
    let success = true;
    let index = 1;
    
    for (const embedding of embeddings) {
      console.log(`Mock: Adding embedding ${index} for ${image}`);
      index++;
    }
    
    return success;
  }

  async findTopKMatchesToFile(collection, image, k) {
    console.log(`Mock: Finding top ${k} matches for file ${image}`);
    return [{ ids: ["mock-1", "mock-2"], distances: [0.1, 0.2], documents: ["doc1", "doc2"] }];
  }

  async findTopKMatchesToBuffer(collection, image, k) {
    console.log(`Mock: Finding top ${k} matches for buffer`);
    return [{ ids: ["mock-1", "mock-2"], distances: [0.1, 0.2], documents: ["doc1", "doc2"] }];
  }
}

export default FaceEmbed;