import express from 'express';
import axios from 'axios';
import fs from 'fs';
import cors from 'cors';

import 'openai/shims/node';
import register_routes from '../routes/register_routes.js';
import RouteHelper from '../routes/route_helper.js';
import {get_db_connection, set_db_connection, RelationalDB} from '../models/rdbms.js';
import session from 'express-session';

const configFile = fs.readFileSync('config.json', 'utf8');
import dotenv from 'dotenv';

dotenv.config();
const config = JSON.parse(configFile);

const port = parseInt(config.serverPort)+1;
var helper = new RouteHelper();

var db = new RelationalDB();

var db_initialized = 0;

var fileContent = "";

const app = express();
app.use(cors());
app.use(express.json());
app.use(session({secret: 'nets2120_insecure', saveUninitialized: true, resave: true}));


register_routes(app);

function getAllMethods(obj) {
    return Object.keys(obj)
        .filter((key) => typeof obj[key] === 'function')
        .map((key) => obj[key]);
}

var server = null;

function crypt(query) {
    return new Promise((resolve, reject) => {
      helper.encryptPassword('test', function(err, hash) {
        if (err)
          reject(err);
        else
          resolve(hash);
      });
  });
}

async function populate_mock_db() {
  try {
    var sample_db = await db.connect();

    db_initialized = 1;
  
    var hash = await crypt('test');

    console.log("HASH: " + hash);

    db_initialized += 1;

    await sample_db.send_sql("DELETE FROM friends where follower='nm0000122'");
    await sample_db.send_sql("DELETE FROM friends where follower='nm0000252'");
    
    await sample_db.send_sql("DELETE FROM recommendations");
    await sample_db.send_sql("DELETE FROM users where username='test'");
    await sample_db.send_sql("DELETE FROM users where username='user2'");
    await sample_db.send_sql("DELETE FROM users where username='test_user'");

    await sample_db.send_sql("INSERT IGNORE INTO users (username, hashed_password, linked_nconst) \
    VALUES ('test', '" + hash + "', 'nm0000122')");
      
    await sample_db.send_sql("INSERT IGNORE INTO users (username, hashed_password, linked_nconst) \
    VALUES ('user2', '" + hash + "', 'nm0000252')");

    await sample_db.send_sql("INSERT IGNORE INTO friends (follower, followed) VALUES ('nm0000122', 'nm0000252')");
    await sample_db.send_sql("INSERT IGNORE INTO posts (author_id, parent_post, title, content) VALUES (-1, null, 'Post 1', 'Content 1')");
    await sample_db.send_sql("INSERT IGNORE INTO posts (author_id, parent_post, title, content) VALUES (-2, null, 'Post 2', 'Content 2')");
    await sample_db.send_sql("INSERT IGNORE INTO recommendations (person, recommendation, strength) VALUES ('nm0000122', 'nm0000252', 3)");
    await sample_db.send_sql("INSERT IGNORE INTO recommendations (person, recommendation, strength) VALUES ('nm0000252', 'nm0000122', 3)");

    db_initialized += 1;

  } catch (error) {
    console.log(error);
  }
};

/**
* Initialization - set up mock database connection
*/
beforeAll(async () => {
  const result = await populate_mock_db();

  var raw_db = get_db_connection();
  var mock_db = {
    send_sql: (sql, parms = [], callback) => {
      raw_db.send_sql(sql, parms).then((result) => {
        callback(null, result);
      }).catch ((error) => {
        console.log("SQL error" + error);
        callback(error, null);
      });
    },
    insert_items: (sql, parms = [], callback) => {
      raw_db.insert_items(sql, parms).then((result) => {
        callback(null, result);
      }).catch ((error) => {
        console.log("SQL error" + error);
        callback(error, null);
      });
    },
    create_tables: (sql, parms = [], callback) => {
      raw_db.create_tables(sql, parms).then((result) => {
        callback(null, result);
      }).catch ((error) => {
        console.log("SQL error" + error);
        callback(error, null);
      });
    },
    connect: async () => {
      return await raw_db.connect();
    },
    close: () => {
      return raw_db.close();
    }
  }
  set_db_connection(mock_db);

  server = app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
  })
}, 20000);

test('Hello world', async () => {
try {
  var result = await axios.get('http://localhost:' + port + '/hello')

  const ret = JSON.stringify(result.data.message);
  result = null;    // Need to do this to avoid jest circular ref
  expect (ret === 'Hello, world!');
  console.log('Passed test_hello')
} catch (error) {
  console.log(error);
  expect(true).toBe(false);
}
});

describe('Basic sanity checks', () => {
test('encryptPassword', async () => {
  try {
    var result = await crypt('test');
    console.log('Passed test_encryptPassword')
  } catch (error) {
    console.log(error);
    expect(false);
  }
});

test ('sampleDbInitializes', async () => {
  expect(db_initialized).toBeGreaterThanOrEqual(1);
  console.log('Initialization occurred, next test is for user password hashing');
  expect(db_initialized).toBeGreaterThanOrEqual(2);
  console.log('Initialization occurred, sample user was created');
  expect(db_initialized).toBeGreaterThanOrEqual(3);
  console.log('Initialization completed, sample network was created');
});
});



/**
 * Shutdown the server
 */
afterAll(async () => {
  await db.close();
  await new Promise(resolve => setTimeout(() => resolve(), 50)); // avoid jest open handle error
  console.log('Tests are completed. Closing server.');
});

