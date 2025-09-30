import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import { convertHtmlToBlocks } from './converter.js';
import { DocumentBodyBlock } from './models/blocks/document-body-block.js';

const visitedUrls = new Set<string>();
const queue: string[] = [];
const processedArticles: { url: string; article: DocumentBodyBlock[] }[] = [];
let batchCounter = 1;

const BATCH_SIZE = 100;
const mainDomain = 'www.mdanderson.org';
const startingUrl = `https://${mainDomain}`;

async function scrape(url: string) {
  if (visitedUrls.has(url)) {
    return;
  }

  console.log(`Scraping ${url}`);
  visitedUrls.add(url);

  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // Process the page
    const html = $('body').html() || '';
    const knowledgeArticle = convertHtmlToBlocks(html);
    processedArticles.push({ url, article: knowledgeArticle });

    if (processedArticles.length >= BATCH_SIZE) {
      await saveArticles();
    }

    // Add new links to the queue
    $('a').each((i, link) => {
      const href = $(link).attr('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, url).toString().split('#')[0]; // Create absolute URL and remove fragment
          const urlObject = new URL(absoluteUrl);

          if (
            urlObject.hostname === mainDomain &&
            !visitedUrls.has(absoluteUrl)
          ) {
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

async function saveArticles() {
  const outputDir = 'output';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }
  const filename = path.join(outputDir, `articles-batch-${batchCounter++}.json`);
  fs.writeFileSync(filename, JSON.stringify(processedArticles, null, 2));
  console.log(`Saved ${processedArticles.length} articles to ${filename}`);
  processedArticles.length = 0; // Clear the array
}

async function main() {
  queue.push(startingUrl);

  while (queue.length > 0) {
    const url = queue.shift();
    if (url) {
      await scrape(url);
    }
  }

  // Save any remaining articles
  if (processedArticles.length > 0) {
    await saveArticles();
  }

  console.log('Scraping complete.');
}

main();