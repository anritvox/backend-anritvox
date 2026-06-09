async function generateEmbedding(text) {
  return [];
}

async function syncProductToVectorDB(product) {
  return true;
}

async function performSemanticSearch(userQuery, limit = 10) {
  return [];
}

module.exports = {
  generateEmbedding,
  syncProductToVectorDB,
  performSemanticSearch
};
