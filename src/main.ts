import { convertHtmlToBlocks } from './converter.js';
import * as fs from 'fs';

const main = () => {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.error('Usage: npm start <input_file.html>');
    process.exit(1);
  }

  const inputFile = args[0];

  fs.readFile(inputFile, 'utf8', (err, html) => {
    if (err) {
      console.error(`Error reading file: ${err.message}`);
      process.exit(1);
    }

    const blocks = convertHtmlToBlocks(html);
    console.log(JSON.stringify(blocks, null, 2));
  });
};

main();
