import ChromaDB from './vector.js';
import S3KeyValueStore from './s3.js';
import FaceEmbed from './face_embed.js';
import fs from 'fs';
import dotenv from 'dotenv';

const configFile = fs.readFileSync('server/config.json', 'utf8');
const config = JSON.parse(configFile);

dotenv.config()

const userid = process.env.USER_ID;

if (!userid) {
  console.error("Please set your user ID in the USER_ID environment variable in .env");
  process.exit(1);
}

const chroma = ChromaDB();
const s3 = new S3KeyValueStore('nets2120-images', "default");
const face = new FaceEmbed();

/**
 * This is an important helper function: it takes the path to a file on S3,
 * downloads it, and returns its embedding as a vector (array).
 * 
 * @param {*} id 
 * @param {*} fileName 
 * @returns 
 */
async function getEmbedding(id, fileName) {
  if (fileName.startsWith('imdb_crop/')) {
    fileName = fileName.replace('imdb_crop/', '');
  }
  const file_obj = await s3.fetchFileBinary(fileName);
  
  const embeddings = await face.getEmbeddingsFromBuffer(file_obj);
  return embeddings[0];
}

// TODO: open merged_imdb_data.csv and read the data
//       for each row, create a record in two databases, each
//       letting us look up the other.  In ChromaDB, use
//         config.chromaDbName as the table name.  Include:
//         the row ID from the source, embedding, and the entire row as the item.
//       In DynamoDB, use config.dynamoDbTableName as the table name.  Include
//         the nconst field as the hash key, the id field as the range key,
//         and the name, birthYear, and deathYear fields as attributes.
async function add_rows_to_vector_store(MAX) {
  const data = fs.readFileSync('merged_imdb_data.csv', 'utf8');
  const rows = data.split('\n').filter(row => row.trim() !== ''); // Remove empty rows
  const headers = rows[0].split(',').map(h => h.trim());
  let count = 0;
  for (let i = 1; i < rows.length && count < MAX; i++) {
    const id = i - 1;
    const values = rows[i].split(',');
    if (values.length < headers.length) continue;
    const row = Object.fromEntries(headers.map((key, index) => [key, values[index]?.trim() || null]));
    const { nconst, primaryName, birthYear, deathYear, path: imagePath } = row;
    if (!nconst) continue;
    try {
      console.log(`Processing row ${id} (nconst: ${nconst})`);
      if (!imagePath) {
        console.log(`No image for ${nconst}`);
        continue;
      }
      const embedding = await getEmbedding(nconst, imagePath);
      if (!embedding){
        console.log(`No embedding for ${nconst}`);
        continue;
      }
      // Only push nconst, primaryName, and entries (if present) to ChromaDB
      const chromaData = { nconst, primaryName };
      if (row.entries !== undefined) {
        chromaData.entries = row.entries;
      }
      try {
        await chroma.put_item_into_table(config.chromaDbName, id.toString(), embedding, chromaData);
        count++;
      } catch (err) {
        if (err.message && err.message.includes('already exists')) {
          console.warn(`Chroma entry for ${nconst} already exists, skipping.`);
        } else {
          throw err;
        }
      }
    } catch (err) {
      console.error(`Error processing row ${id} (nconst: ${nconst}):`, err);
    }
  }
  return count;
}


/////////////////////////////////////////////////////////////////////////////////////
//// Main program starts here
//

// Create the tables if they don't exist, in ChromaDB and DynamoDB

var coll = await chroma.create_table(config.chromaDbName);
await face.loadModel();
await add_rows_to_vector_store(config.max);