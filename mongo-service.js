const { MongoClient } = require('mongodb');

let client;
let db;

async function connectMongo() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/fundaris-credit';

  if (!client) {
    client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db();
  }

  return db;
}

async function saveSubmission(collectionName, payload) {
  const database = await connectMongo();
  const collection = database.collection(collectionName);
  const result = await collection.insertOne(payload);
  return result;
}

async function getSubmissions(collectionName) {
  const database = await connectMongo();
  const collection = database.collection(collectionName);
  return collection.find({}).sort({ createdAt: -1 }).toArray();
}

module.exports = { connectMongo, saveSubmission, getSubmissions };

