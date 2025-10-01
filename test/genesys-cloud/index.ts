import 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import platformClient from 'purecloud-platform-client-v2';
import * as genesysCloud from '../../src/genesys-cloud.js';

describe('Genesys Cloud Integration', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Set necessary environment variables for tests
    process.env.GENESYS_CLIENT_ID = 'test-client-id';
    process.env.GENESYS_CLIENT_SECRET = 'test-client-secret';
    process.env.GENESYS_REGION = 'us-east-1';
    process.env.GENESYS_KNOWLEDGE_BASE_ID = 'test-kb-id';
  });

  afterEach(() => {
    sandbox.restore();
    delete process.env.GENESYS_CLIENT_ID;
    delete process.env.GENESYS_CLIENT_SECRET;
    delete process.env.GENESYS_REGION;
    delete process.env.GENESYS_KNOWLEDGE_BASE_ID;
  });

  describe('initialize', () => {
    it('should initialize the Genesys Cloud client successfully', async () => {
      const setEnvironmentStub = sandbox.stub(platformClient.ApiClient.instance, 'setEnvironment');
      const loginStub = sandbox.stub(platformClient.ApiClient.instance, 'loginClientCredentialsGrant').resolves();

      await genesysCloud.initialize();

      expect(setEnvironmentStub.calledOnceWith('us-east-1')).to.be.true;
      expect(loginStub.calledOnceWith('test-client-id', 'test-client-secret')).to.be.true;
      expect(genesysCloud.state.knowledgeBaseId).to.equal('test-kb-id');
    });

    it('should throw an error if environment variables are missing', async () => {
      delete process.env.GENESYS_CLIENT_ID;
      try {
        await genesysCloud.initialize();
        expect.fail('Expected initialize to throw an error but it did not.');
      } catch (error) {
        expect((error as Error).message).to.equal('Missing required Genesys Cloud environment variables.');
      }
    });
  });

  describe('createKnowledgeArticle', () => {
    it('should create a knowledge article with the correct parameters', async () => {
      const title = 'Test Article';
      const content = [{ type: 'Paragraph', paragraph: { blocks: [] } }];
      const createdDocument = { title: 'Test Article', id: '123' };
      const createdVariation = {
        id: 'var-456',
        contexts: [{
          context: { id: 'global' },
          values: []
        }]
      };

      const postKnowledgeKnowledgebaseDocumentsStub = sandbox.stub(genesysCloud.knowledgeApi, 'postKnowledgeKnowledgebaseDocuments').resolves(createdDocument);
      const postKnowledgeKnowledgebaseDocumentVariationsStub = sandbox.stub(genesysCloud.knowledgeApi, 'postKnowledgeKnowledgebaseDocumentVariations').resolves(createdVariation);

      // Directly set the knowledgeBaseId for the test
      genesysCloud.state.knowledgeBaseId = 'test-kb-id';

      const result = await genesysCloud.createKnowledgeArticle(title, content as any);

      // Verify postKnowledgeKnowledgebaseDocuments call
      expect(postKnowledgeKnowledgebaseDocumentsStub.calledOnce).to.be.true;
      const [kbId, docCreateReq] = postKnowledgeKnowledgebaseDocumentsStub.firstCall.args;
      expect(kbId).to.equal('test-kb-id');
      expect(docCreateReq.title).to.equal(title);
      expect(docCreateReq.visible).to.be.true;

      // Verify postKnowledgeKnowledgebaseDocumentVariations call
      expect(postKnowledgeKnowledgebaseDocumentVariationsStub.calledOnce).to.be.true;
      const [varKbId, varDocId, varReq] = postKnowledgeKnowledgebaseDocumentVariationsStub.firstCall.args;
      expect(varKbId).to.equal('test-kb-id');
      expect(varDocId).to.equal(createdDocument.id);
      expect(varReq.body).to.not.be.undefined;
      if (varReq.body) {
        expect(varReq.body.blocks).to.deep.equal(content);
      }
      expect(varReq.contexts).to.deep.equal([
        {
          context: { id: 'global' },
          values: []
        }
      ]);

      // Verify the final result
      expect(result).to.deep.equal(createdDocument);
    });
  });
});