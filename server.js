const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const mysql = require('mysql2');  // Import the mysql2 package

const app = express();
app.use(cors());
app.use(express.json());

// MySQL connection setup
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',     // Replace with your MySQL username
  password: 'root', // Replace with your MySQL password
  database: 'price_tracker',       // Replace with your MySQL database name
});

// Connect to the MySQL database
db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL database:', err);
  } else {
    console.log('Connected to MySQL database');
  }
});

// Route to scrape product price and save to database
app.post('/api/scrape', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);

    let price = null;
    let productName = null;

    const priceSelectors = [
      '.a-price .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '.a-price-whole',
      '.a-price',
      '.a-color-price'
    ];

    for (const selector of priceSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        price = element.text().trim();
        break;
      }
    }

    productName = $('#productTitle').text().trim();

    if (!price) {
      const priceRegex = /\$\d+\.\d{2}|₹\s*[\d,]+(\.\d{2})?/g;
      const matches = html.match(priceRegex);
      if (matches && matches.length > 0) {
        price = matches[0];
      }
    }

    if (!price) {
      return res.status(404).json({ error: 'Price not found' });
    }

    if (!productName) {
      productName = 'Product';
    }

    const dateAdded = new Date().toISOString();

    // Insert product into MySQL database
    db.query(
      'INSERT INTO products (name, url, price, dateAdded) VALUES (?, ?, ?, ?)',
      [productName, url, price, dateAdded],
      function (err, result) {
        if (err) {
          console.error('Database insert error:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        res.json({
          id: result.insertId,
          name: productName,
          url: url,
          price: price,
          dateAdded: dateAdded
        });
      }
    );
  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({
      error: 'Failed to scrape product price',
      details: error.message
    });
  }
});

// Route to fetch all saved products from MySQL
app.get('/api/products', (req, res) => {
  db.query('SELECT * FROM products', (err, rows) => {
    if (err) {
      console.error('Database fetch error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json(rows);
  });
});

// Testing route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Scraper API is working!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Test the API: http://localhost:${PORT}/api/test`);
});

console.log('\nTo use this scraper:');
console.log('1. POST to http://localhost:5000/api/scrape with { "url": "https://www.amazon.com/product-page" }');
console.log('2. GET all saved products from http://localhost:5000/api/products\n');
