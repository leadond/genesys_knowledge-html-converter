import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import * as dotenv from 'dotenv';
import { convertHtmlToBlocks } from './converter.js';
import { DocumentBodyBlock } from './models/blocks/document-body-block.js';
import { initialize, createKnowledgeArticle } from './genesys-cloud.js';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

dotenv.config();

const visitedUrls = new Set<string>();
const queue: string[] = [];
const processedArticles: { url: string; question: string; answer: DocumentBodyBlock[] }[] = [];

const BATCH_SIZE = 100;
const mainDomain = 'www.mdanderson.org';
const startingUrl = `https://${mainDomain}`;

const QaSchema = z.object({
  questionsAndAnswers: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  }))
});

async function generateQa(content: string): Promise<z.infer<typeof QaSchema>> {
  const { object } = await generateObject({
    model: google('models/gemini-1.5-flash-latest'),
    schema: QaSchema,
    prompt: `Given the following text from a webpage, generate a list of questions and answers that a user might have. The answers should be based *only* on the provided text. Include a direct link to the source page in each answer. Here is the text: ${content}`,
  });
  return object;
}

async function scrape(url: string) {
  if (visitedUrls.has(url)) {
    return;
  }

  console.log(`Scraping ${url}`);
  visitedUrls.add(url);

  try {
    const response = await axios.get(url, { timeout: 15000 });
    const $ = cheerio.load(response.data as string);
    const title = $('title').text() || 'No Title Found';
    const textContent = $('body').text();

    if (textContent.trim().length === 0) {
        console.log(`Skipping empty page: ${url}`);
        return;
    }

    const qaResult = await generateQa(textContent);

    for (const qa of qaResult.questionsAndAnswers) {
        const answerWithSource = `${qa.answer}\n\nSource: ${url}`;
        const answerBlocks = convertHtmlToBlocks(`<p>${answerWithSource.replace(/\n/g, '<br>')}</p>`);
        processedArticles.push({
            url,
            question: qa.question,
            answer: answerBlocks,
        });
    }

    if (processedArticles.length >= BATCH_SIZE) {
      await pushArticlesToGenesys();
    }

    $('a').each((i, link) => {
      const href = $(link).attr('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, url).toString().split('#')[0];
          const urlObject = new URL(absoluteUrl);
          if (urlObject.hostname === mainDomain && !visitedUrls.has(absoluteUrl) && !queue.includes(absoluteUrl)) {
            queue.push(absoluteUrl);
          }
        } catch (e) {
          // ignore invalid URLs
        }
      }
    });
  } catch (error) {
    console.error(`Error scraping ${url}: ${error}`);
  }
}

async function pushArticlesToGenesys() {
    console.log(`\n--- Pushing ${processedArticles.length} Q&A pairs to Genesys Cloud ---`);
    for (const item of processedArticles) {
        try {
            await createKnowledgeArticle(item.question, item.answer);
        } catch (error) {
            console.error(`Failed to create article for question: "${item.question}" from ${item.url}:`, error);
        }
    }
    console.log(`--- Finished pushing batch ---\n`);
    processedArticles.length = 0;
}

async function main() {
  try {
    await initialize();
    queue.push(startingUrl);

    while (queue.length > 0) {
      const url = queue.shift();
      if (url) {
        await scrape(url);
      }
    }

    if (processedArticles.length > 0) {
      await pushArticlesToGenesys();
    }

    console.log('Scraping and Q&A generation complete.');
  } catch (error) {
    console.error('An unexpected error occurred during the main process:', error);
  }
}

main().catch((err) => {
  console.error('Scraper failed to run:', err);
  process.exit(1);
});