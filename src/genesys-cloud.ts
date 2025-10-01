import platformClient from 'purecloud-platform-client-v2';
import { DocumentBodyBlock } from './models/blocks/document-body-block.js';

const client = platformClient.ApiClient.instance;
export const knowledgeApi = new platformClient.KnowledgeApi();

export const state = {
  knowledgeBaseId: '',
};

export async function initialize() {
  const {
    GENESYS_CLIENT_ID,
    GENESYS_CLIENT_SECRET,
    GENESYS_REGION,
    GENESYS_KNOWLEDGE_BASE_ID,
  } = process.env;

  if (!GENESYS_CLIENT_ID || !GENESYS_CLIENT_SECRET || !GENESYS_REGION || !GENESYS_KNOWLEDGE_BASE_ID) {
    throw new Error('Missing required Genesys Cloud environment variables.');
  }

  client.setEnvironment(GENESYS_REGION);
  await client.loginClientCredentialsGrant(
    GENESYS_CLIENT_ID,
    GENESYS_CLIENT_SECRET
  );
  state.knowledgeBaseId = GENESYS_KNOWLEDGE_BASE_ID;
  console.log('Successfully authenticated with Genesys Cloud.');
}

export async function createKnowledgeArticle(
  title: string,
  content: DocumentBodyBlock[]
) {
  if (!state.knowledgeBaseId) {
    throw new Error('Genesys Cloud SDK not initialized.');
  }

  try {
    // First, create the document
    const documentCreateRequest: platformClient.Models.KnowledgeDocumentCreateRequest = {
      title: title,
      visible: true,
      // The initial creation does not include the body.
    };

    const newDocument = await knowledgeApi.postKnowledgeKnowledgebaseDocuments(
        state.knowledgeBaseId,
        documentCreateRequest
    );

    if (!newDocument.id) {
      throw new Error('Failed to create knowledge document.');
    }

    // Then, create a variation for the document to add the body
    const variationRequest: platformClient.Models.DocumentVariationRequest = {
      body: {
        blocks: content,
      },
      // Default context for the variation
      contexts: [
        {
          context: {
            id: 'global' // Default context ID
          },
          values: []
        }
      ]
    };

    const newVariation = await knowledgeApi.postKnowledgeKnowledgebaseDocumentVariations(
        state.knowledgeBaseId,
        newDocument.id,
        variationRequest
    );

    console.log(`Successfully created article variation for: ${newDocument.title}`);
    return newDocument;
  } catch (error) {
    console.error(`Error creating knowledge article: ${error}`);
    throw error;
  }
}