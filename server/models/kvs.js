import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {fromIni} from "@aws-sdk/credential-provider-ini";
import {ScanCommand, CreateTableCommand, GetItemCommand, PutItemCommand, QueryCommand} from "@aws-sdk/client-dynamodb";

import fs from 'fs';


const configFile = fs.readFileSync('server/config.json', 'utf8');
const config = JSON.parse(configFile);

var the_db = {};

class DynamoDbKVS {
  client = null;

  constructor(region, credentials) {
      this.client = 
      new DynamoDBClient({
        region: region, // Specify the AWS region
        credentials,
      });
    };

  // /**
  //  * Scan the table for items that contain the specified words
  //  * 
  //  * @param {*} field to scan for the various words
  //  * @param {*} words all of these words (space delimited) must be present in the field
  //  * @returns 
  //  */
  // scan: async function(table, field, words) {
  //   return this.scan_table(config.dynamoDbTableName, field, words);
  // },

  async create_table (tableName, keySchema, attributeDefinitions, provisionedThroughput) {
    const command = new CreateTableCommand({
      TableName: tableName,
      KeySchema: keySchema,
      AttributeDefinitions: attributeDefinitions,
      ProvisionedThroughput: provisionedThroughput
    });
    return this.client.send(command);
  };

  async put_item_into_table (tableName, item) {
    const command = new PutItemCommand({
      TableName: tableName,
      Item: item
    });

    return this.client.send(command);
  };

  async get_item_from_table (tableName, key) {
    const command = new GetItemCommand({
      TableName: tableName,
      Key: key
    });

    return this.client.send(command);
  };

  /**
   * Scan the table for items that contain the specified words
   * 
   * @param {*} tableName Specific DynamoDB table to scan
   * @param {*} field to scan for the various words
   * @param {*} words all of these words (space delimited) must be present in the field
   */
  async scan_table_substring (tableName, field, words) {
    // Construct the FilterExpression
    let filterExpression = words.map(
      (word, idx) => `contains(#${field}, :value${idx})`).join(' AND ');

    // Construct the ExpressionAttributeValues
    let expressionAttributeValues = {};
    words.forEach((word, idx) => {
      expressionAttributeValues[`:value${idx}`] = {S: word};
    });

    // Use ExpressionAttributeNames to avoid conflicts with reserved words
    let expressionAttributeNames = {
      [`#${field}`]: field
    };

    const command = new ScanCommand({
      TableName: tableName,
      FilterExpression: filterExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    });

    return this.client.send(command);
  };

  /**
   * Scan the table for items matching the specified field and numeric value
   * 
   * @param {*} tableName Specific DynamoDB table to scan
   */
  async scan_table_equals (tableName, field1, value1) {
    // Construct the FilterExpression
    let filterExpression = `#${field1} = :value1`;

    // Construct the ExpressionAttributeValues
    let expressionAttributeValues = null;

    if (typeof value1 === 'string') {
      expressionAttributeValues = {
        ':value1': {S: value1}
      };
    } else {
      expressionAttributeValues = {
        ':value1': {N: value1}
      };        
    }

    // Use ExpressionAttributeNames to avoid conflicts with reserved words
    let expressionAttributeNames = {
      [`#${field1}`]: field1
    };

    const command = new ScanCommand({
      TableName: tableName,
      FilterExpression: filterExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    });

    return this.client.send(command);
  };

  async query_table_secondary_index(tableName, indexName, key, value) {
    // Construct the KeyConditionExpression
    const keyConditionExpression = `#${key} = :value`;
  
    var expressionAttributeValues = null;
    // Construct the ExpressionAttributeValues
    if (typeof value === 'string') {
      expressionAttributeValues = {
        ':value': {S: value}
      };
    } else {
      expressionAttributeValues = {
        ':value': {N: value}
      };        
    }
  
    // Use ExpressionAttributeNames to avoid conflicts with reserved words
    const expressionAttributeNames = {
      [`#${key}`]: key
    };
  
    const command = new QueryCommand({
      TableName: tableName,
      IndexName: indexName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    });
  
    try {
      const data = await this.client.send(command);
      console.log(`Number of items returned: ${data.Items.length}`);
      return data.Items;
    } catch (err) {
      console.error('Error querying table:', err);
      throw err;
    }
  };


  async query_table_by_key(tableName, key, value) {
    // Construct the KeyConditionExpression
    const keyConditionExpression = `#${key} = :value`;
  
    var expressionAttributeValues = null;
    // Construct the ExpressionAttributeValues
    if (typeof value === 'string') {
      expressionAttributeValues = {
        ':value': {S: value}
      };
    } else {
      expressionAttributeValues = {
        ':value': {N: value}
      };        
    }
  
    // Use ExpressionAttributeNames to avoid conflicts with reserved words
    const expressionAttributeNames = {
      [`#${key}`]: key
    };
  
    const command = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    });
  
    try {
      const data = await this.client.send(command);
      console.log(`Number of items returned: ${data.Items.length}`);
      return data.Items;
    } catch (err) {
      console.error('Error querying table:', err);
      throw err;
    }
  };


  /**
   * Scan the table for items matching the specified field and numeric value
   * 
   * @param {*} tableName Specific DynamoDB table to scan
   */
  async scan_table_between (tableName, field1, value1, field2, value2) {
    // Construct the FilterExpression
    let filterExpression = `#${field1} >= :value1 and #${field2} <= :value2`;

    // Construct the ExpressionAttributeValues
    let expressionAttributeValues = {
      ':value1': {N: value1},
      ':value2': {N: value2}
    };

    // Use ExpressionAttributeNames to avoid conflicts with reserved words
    let expressionAttributeNames = {
      [`#${field1}`]: field1,
      [`#${field2}`]: field2
    };

    const command = new ScanCommand({
      TableName: tableName,
      FilterExpression: filterExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    });

    return this.client.send(command);
  }

};

/**
 * For mocking
 * 
 * @param {*} db 
 */
function set_db_connection_singleton(ddb) {
    the_db = ddb;
}

/**
 * Get a connection to the DynamoDB database or a mock object
 * 
 * @returns An instance of the DynamoDBClient
 */
function get_db_connection_singleton(profile = 'default') {
  if (the_db[profile]) {
      return the_db[profile];
  }

  console.log('Creating a new connection to the database');

  const credentials = fromIni({ profile: profile }); // Specify the profile here

  the_db[profile] = new DynamoDbKVS(config.awsRegion, credentials);
  return the_db[profile];
}
  


export {
  get_db_connection_singleton,
  set_db_connection_singleton,
  DynamoDbKVS
};

export default get_db_connection_singleton;