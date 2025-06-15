const express = require("express");
const mysql = require("mysql2/promise");
const fileUpload = require("express-fileupload");
const helmet = require("helmet");
const compression = require("compression");
require('dotenv').config();

const app = express();

// Security and performance middleware (no rate limiting)
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(compression());

// Standard middleware
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(fileUpload({
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 5
  },
  abortOnLimit: true,
  useTempFiles: true,
  tempFileDir: '/tmp/'
}));

// IMPROVED DATABASE CONNECTION POOL
const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root", 
  password: process.env.DB_PASSWORD || "cgg@65830",
  database: process.env.DB_NAME || "erp",
  
  // Connection settings
  connectTimeout: 30000,        // 30 seconds to establish connection
  acquireTimeout: 30000,        // 30 seconds to get connection from pool
  timeout: 30000,               // 30 seconds for queries
  
  // Pool settings
  connectionLimit: 10,          // Reduced for stability
  queueLimit: 0,
  waitForConnections: true,
  
  // Keep-alive and reconnection
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  reconnect: true,
  
  // SSL settings (important for hosted databases)
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false
  } : false,
  
  // Other settings
  dateStrings: true,
  multipleStatements: false,
  charset: 'utf8mb4'
};

let dbPool;
let isDbConnected = false;


const dbPool = mysql.createPool(dbConfig);

// Improved connection test with better error handling and retry logic
async function testConnection(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔄 Attempting database connection (attempt ${i + 1}/${retries})...`);
      
      const connection = await dbPool.getConnection();
      console.log(`✅ Database connected successfully to ${process.env.DB_HOST || 'localhost'}`);
      
      // Test the connection with a simple query
      await connection.execute('SELECT 1 as test');
      console.log(`✅ Database query test successful`);
      
      connection.release();
      return; // Success - exit function
      
    } catch (error) {
      console.error(`❌ Database connection attempt ${i + 1} failed:`, {
        message: error.message,
        code: error.code,
        errno: error.errno,
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306
      });
      
      if (i === retries - 1) {
        // Last attempt failed
        console.error('💀 All database connection attempts failed. Check:');
        console.error('   1. Database server is running');
        console.error('   2. Connection credentials are correct');
        console.error('   3. Network connectivity to database');
        console.error('   4. Firewall settings');
        console.error('   5. Database accepts connections from this IP');
        
        // Don't exit in production - let the app start but log the error
        if (process.env.NODE_ENV === 'production') {
          console.error('⚠️  Starting server without database connection (production mode)');
          return;
        } else {
          process.exit(1);
        }
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Helper function for safe database queries
async function safeQuery(query, params = []) {
  let connection;
  try {
    connection = await dbPool.getConnection();
    
    if (params.length === 0) {
      const [results] = await connection.query(query);
      return results;
    } else {
      const [results] = await connection.query(query, params);
      return results;
    }
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

// Helper function for transactions
async function safeTransaction(callback) {
  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Async wrapper for route handlers
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ROUTES
app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/public/index.html");
});

// Login endpoint
app.get("/chk-login-submit", asyncHandler(async (req, res) => {
  const { kuchemail, kuchpwd } = req.query;
  
  if (!kuchemail || !kuchpwd) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const results = await safeQuery(
      "SELECT * FROM erp.register WHERE username=? AND password=?", 
      [kuchemail, kuchpwd]
    );
    
    if (results.length > 0) {
      if (results[0].status == 1 || results[0].status == 2) {
        res.status(200).send(results[0].status.toString());
      } else {
        res.status(403).send("USER BLOCKED");
      }
    } else {
      res.status(401).send("INVALID EMAIL OR PASSWORD");
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).send("Server Error");
  }
}));

// Inventory submission
app.get("/submit", asyncHandler(async (req, res) => {
  const { productName, orderQuantity, costPrice, sellingPrice } = req.query;

  if (!productName || !orderQuantity || !costPrice || !sellingPrice) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const quantity = parseInt(orderQuantity);
  const cp = parseFloat(costPrice);
  const sp = parseFloat(sellingPrice);

  if (isNaN(quantity) || isNaN(cp) || isNaN(sp) || quantity <= 0) {
    return res.status(400).json({ error: "Invalid input values" });
  }

  try {
    const result = await safeTransaction(async (connection) => {
      const [existingProduct] = await connection.query(
        "SELECT * FROM erp.inventory WHERE product_name = ? AND cp = ? FOR UPDATE",
        [productName, cp]
      );

      if (existingProduct.length > 0) {
        await connection.query(
          "UPDATE erp.inventory SET quantity = quantity + ? WHERE product_name = ? AND cp = ?",
          [quantity, productName, cp]
        );
        return "Quantity updated successfully";
      } else {
        await connection.query(
          "INSERT INTO erp.inventory(product_name, quantity, cp, sp) VALUES(?,?,?,?)",
          [productName, quantity, cp, sp]
        );
        return "Record saved successfully";
      }
    });

    res.json({ message: result, success: true });
  } catch (error) {
    console.error('Inventory submission error:', error);
    res.status(500).json({ error: "Server Error" });
  }
}));

// Get inventory
app.get("/getInventory", asyncHandler(async (req, res) => {
  try {
    const results = await safeQuery("SELECT * FROM erp.inventory");
    res.json(results);
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ error: "Error fetching inventory data" });
  }
}));

// Update inventory
app.post('/updateInventory', asyncHandler(async (req, res) => {
  const { itemId, quantity } = req.body;

  if (!itemId || quantity === undefined) {
    return res.status(400).json({ error: "Item ID and quantity are required" });
  }

  const qty = parseInt(quantity);
  if (isNaN(qty) || qty < 0) {
    return res.status(400).json({ error: "Quantity must be a non-negative number" });
  }

  try {
    const result = await safeQuery(
      "UPDATE erp.inventory SET quantity = ? WHERE id = ?", 
      [qty, parseInt(itemId)]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Item not found" });
    }
    
    res.json({ message: "Inventory updated successfully", success: true });
  } catch (error) {
    console.error('Update inventory error:', error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}));

// Save statistics
app.post('/saveStatistics', asyncHandler(async (req, res) => {
  const { totalItemsSold, totalValueGet } = req.body;

  if (!totalItemsSold || !totalValueGet) {
    return res.status(400).json({ message: 'Total items sold and total value are required' });
  }

  try {
    await safeQuery(
      "INSERT INTO erp.statistics (total_items_sold, total_value_get, timestamp) VALUES (?, ?, NOW())", 
      [parseInt(totalItemsSold), parseFloat(totalValueGet)]
    );
    res.status(200).json({ message: 'Statistics saved successfully' });
  } catch (error) {
    console.error('Save statistics error:', error);
    res.status(500).json({ message: 'Failed to save statistics' });
  }
}));

// Get statistics
app.get('/api/statistics', asyncHandler(async (req, res) => {
  try {
    const results = await safeQuery(`
      SELECT day, SUM(total_value_get) AS total_revenue 
      FROM statistics 
      GROUP BY day 
      ORDER BY FIELD(day, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
    `);
    res.json(results);
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).send('Database query failed');
  }
}));

// Add financial record
app.post('/api/financial-records', asyncHandler(async (req, res) => {
  const { customer_id, amount, status, bills } = req.body;
  
  if (!customer_id || !amount || !status) {
    return res.status(400).json({ error: 'Customer ID, amount, and status are required' });
  }

  try {
    const result = await safeQuery(
      'INSERT INTO financial_records (customer, amount, status, bills, timestamp) VALUES (?, ?, ?, ?, NOW())', 
      [customer_id, parseFloat(amount), status, bills || null]
    );
    res.status(201).json({ message: 'Record added successfully', recordId: result.insertId });
  } catch (error) {
    console.error('Add financial record error:', error);
    res.status(500).json({ error: 'Failed to add record' });
  }
}));

// Get all financial records
app.get("/get-angular-all-records", asyncHandler(async (req, res) => {
  try {
    const results = await safeQuery("SELECT * FROM financial_records");
    res.json(results);
  } catch (error) {
    console.error('Get financial records error:', error);
    res.status(500).send("Server Error");
  }
}));

// Get recent orders
app.get('/api/orders', asyncHandler(async (req, res) => {
  try {
    const results = await safeQuery('SELECT * FROM financial_records ORDER BY timestamp DESC LIMIT 5');
    res.json(results);
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
}));

// Add employee
app.get("/add-employee", asyncHandler(async (req, res) => {
  const { workerName, workerId, workerUsername, workerPassword } = req.query;

  if (!workerName || !workerId || !workerUsername || !workerPassword) {
    return res.status(400).send("Missing required fields");
  }

  try {
    const existing = await safeQuery(
      "SELECT * FROM register WHERE id = ? OR username = ?", 
      [workerId, workerUsername]
    );
    
    if (existing.length > 0) {
      return res.status(409).send("Worker ID or username already exists");
    }
    
    await safeQuery(
      "INSERT INTO register (id, name, username, password, status) VALUES (?, ?, ?, ?, 2)", 
      [workerId, workerName, workerUsername, workerPassword]
    );
    res.status(200).send("Worker added successfully");
  } catch (error) {
    console.error('Add employee error:', error);
    res.status(500).send("Failed to add worker");
  }
}));

// Get employee records
app.get('/get-angular-employee-records', asyncHandler(async (req, res) => {
  try {
    const results = await safeQuery("SELECT * FROM register WHERE status != 1");
    res.json(results);
  } catch (error) {
    console.error('Get employee records error:', error);
    res.status(500).send("Error fetching records");
  }
}));

// Delete employee
app.get("/do-angular-delete", asyncHandler(async (req, res) => {
  const id = req.query.idkuch;
  
  if (!id) {
    return res.status(400).send("ID is required");
  }

  try {
    const result = await safeQuery("DELETE FROM register WHERE id = ?", [id]);
    
    if (result.affectedRows === 1) {
      res.send("Account Removed Successfully!");
    } else {
      res.status(404).send("Invalid ID");
    }
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).send("Server Error");
  }
}));

// Block employee
app.get("/do-angular-block", asyncHandler(async (req, res) => {
  const id = req.query.idkuch;
  
  if (!id) {
    return res.status(400).send("ID is required");
  }

  try {
    const result = await safeQuery("UPDATE register SET status = 0 WHERE id = ?", [id]);
    
    if (result.affectedRows === 1) {
      res.send("Updated Successfully");
    } else {
      res.status(404).send("No such account exists");
    }
  } catch (error) {
    console.error('Block employee error:', error);
    res.status(500).send("Server Error");
  }
}));

// Resume employee
app.get("/do-angular-resume", asyncHandler(async (req, res) => {
  const id = req.query.idkuch;
  
  if (!id) {
    return res.status(400).send("ID is required");
  }

  try {
    const result = await safeQuery("UPDATE register SET status = 2 WHERE id = ?", [id]);
    
    if (result.affectedRows === 1) {
      res.send("Updated Successfully");
    } else {
      res.status(404).send("No such account exists");
    }
  } catch (error) {
    console.error('Resume employee error:', error);
    res.status(500).send("Server Error");
  }
}));

// Get workers
app.get('/api/workers', asyncHandler(async (req, res) => {
  try {
    const results = await safeQuery('SELECT * FROM register WHERE status = 2');
    res.json(results);
  } catch (error) {
    console.error('Get workers error:', error);
    res.status(500).send('Error fetching workers');
  }
}));

// Get worker info
app.post('/api/worker-info', asyncHandler(async (req, res) => {
  const { username } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    const results = await safeQuery('SELECT * FROM register WHERE username = ?', [username]);

    if (results.length > 0) {
      res.json({ worker: results[0] });
    } else {
      res.status(404).json({ error: 'Worker not found' });
    }
  } catch (error) {
    console.error('Get worker info error:', error);
    res.status(500).json({ error: 'Failed to fetch worker info' });
  }
}));

// Save message (worker)
app.post('/api/save-message', asyncHandler(async (req, res) => {
  const { chat, name } = req.body;
  
  if (!chat || !name) {
    return res.status(400).json({ message: 'Chat message and name are required' });
  }

  try {
    const result = await safeQuery(
      'INSERT INTO communication (chat, status, name, timestamp) VALUES (?, ?, ?, ?)', 
      [chat, 2, name, new Date()]
    );
    res.status(200).json({ message: 'Message saved successfully', id: result.insertId });
  } catch (error) {
    console.error('Save message error:', error);
    res.status(500).json({ message: 'Error saving message' });
  }
}));

// Send message (admin)
app.post('/sendMessage', asyncHandler(async (req, res) => {
  const { chat, name } = req.body;
  
  if (!chat || !name) {
    return res.status(400).json({ message: 'Chat message and name are required' });
  }

  try {
    await safeQuery(
      'INSERT INTO communication (chat, status, name, timestamp) VALUES (?, ?, ?, ?)', 
      [chat, 1, name, new Date()]
    );
    res.status(200).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Error saving message' });
  }
}));

// Fetch messages
app.post('/api/fetch-messages', asyncHandler(async (req, res) => {
  const { workerName } = req.body;
  
  if (!workerName) {
    return res.status(400).json({ error: 'Worker name is required' });
  }

  try {
    const results = await safeQuery(
      'SELECT * FROM communication WHERE name = ? ORDER BY timestamp ASC', 
      [workerName]
    );
    res.json({ messages: results });
  } catch (error) {
    console.error('Fetch messages error:', error);
    res.status(500).json({ error: 'Error fetching messages' });
  }
}));

// Fetch messages (alternative endpoint)
app.get('/fetchMessages', asyncHandler(async (req, res) => {
  const { workerName } = req.query;
  
  if (!workerName) {
    return res.status(400).send("Worker name is required");
  }

  try {
    const results = await safeQuery(
      'SELECT * FROM communication WHERE name = ? ORDER BY timestamp ASC', 
      [workerName]
    );
    res.json(results);
  } catch (error) {
    console.error('Fetch messages error:', error);
    res.status(500).send("Internal Server Error");
  }
}));

// Get total revenue and orders
app.get('/getTotalRevenue', asyncHandler(async (req, res) => {
  try {
    const results = await safeQuery(
      'SELECT SUM(amount) AS total_revenue, COUNT(order_id) AS total_orders FROM financial_records'
    );

    const data = {
      totalRevenue: results[0].total_revenue || 0,
      totalOrders: results[0].total_orders || 0
    };

    res.json(data);
  } catch (error) {
    console.error('Get total revenue error:', error);
    res.status(500).send('Database query failed');
  }
}));

// Get total inventory quantity
app.get('/getTotalQuantity', asyncHandler(async (req, res) => {
  try {
    const results = await safeQuery('SELECT SUM(quantity) AS total_quantity FROM inventory');
    const totalquantity = results[0].total_quantity || 0;
    res.json({ totalquantity });
  } catch (error) {
    console.error('Get total quantity error:', error);
    res.status(500).send('Database query failed');
  }
}));

// Get total employees
app.get('/getTotalEmployee', asyncHandler(async (req, res) => {
  try {
    const results = await safeQuery('SELECT COUNT(id) AS total_employee FROM register WHERE status = 2');
    const totalemployee = results[0].total_employee || 0;
    res.json({ totalemployee });
  } catch (error) {
    console.error('Get total employee error:', error);
    res.status(500).send('Database query failed');
  }
}));

// Get revenue data by day
app.get('/getRevenueData', asyncHandler(async (req, res) => {
  try {
    const results = await safeQuery(`
      SELECT DAYNAME(timestamp) AS day, SUM(total_value_get) AS total_revenue
      FROM statistics
      GROUP BY DAYNAME(timestamp)
      ORDER BY DAYNAME(timestamp)
    `);
    res.json(results);
  } catch (error) {
    console.error('Get revenue data error:', error);
    res.status(500).send('Database error');
  }
}));

// Get inventory status
app.get('/getInventoryStatus', asyncHandler(async (req, res) => {
  try {
    const results = await safeQuery(`
      SELECT 
        product_name AS category, 
        quantity,
        CASE 
          WHEN quantity = 0 THEN 'Out of Stock'
          WHEN quantity < 10 THEN 'Low Stock'
          ELSE 'Sufficient Stock'
        END AS status
      FROM inventory
    `);
    res.json(results);
  } catch (error) {
    console.error('Get inventory status error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory data.' });
  }
}));

// Get low stock items
app.post('/api/low-stock', asyncHandler(async (req, res) => {
  try {
    const results = await safeQuery('SELECT product_name, quantity FROM inventory WHERE quantity <= 10');
    res.json(results);
  } catch (error) {
    console.error('Get low stock error:', error);
    res.status(500).json({ error: 'Error fetching low stock items' });
  }
}));

// Get sales summary
app.get('/api/sales-summary', asyncHandler(async (req, res) => {
  try {
    const results = await safeQuery(`
      SELECT
        SUM(amount) AS totalRevenue,
        COUNT(order_id) AS totalOrders,
        AVG(amount) AS averageOrderValue
      FROM financial_records
      WHERE status = 'Completed'
    `);

    const { totalRevenue, totalOrders, averageOrderValue } = results[0];
    res.json({
      totalRevenue: totalRevenue || 0,
      totalOrders: totalOrders || 0,
      averageOrderValue: averageOrderValue || 0
    });
  } catch (error) {
    console.error('Get sales summary error:', error);
    res.status(500).json({ error: 'Database query failed' });
  }
}));

// Get weekly sales
app.get('/api/weekly-sales', asyncHandler(async (req, res) => {
  try {
    const results = await safeQuery(`
      SELECT
        day,
        SUM(total_value_get) AS total_sales
      FROM statistics
      WHERE timestamp >= CURDATE() - INTERVAL 7 DAY
      GROUP BY day
      ORDER BY FIELD(day, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
    `);
    res.json(results);
  } catch (error) {
    console.error('Get weekly sales error:', error);
    res.status(500).json({ error: 'Database query failed' });
  }
}));

// Health check endpoints
app.get('/health', asyncHandler(async (req, res) => {
  try {
    await safeQuery('SELECT 1');
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      error: 'Database connection failed' 
    });
  }
}));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }

  if (err.code && err.code.includes('ER_')) {
    return res.status(500).json({ error: 'Database error' });
  }

  res.status(500).json({ error: 'Internal Server Error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown handling
const gracefulShutdown = () => {
  console.log('Received shutdown signal, closing gracefully...');
  
  dbPool.end((err) => {
    if (err) {
      console.error('Error closing database pool:', err);
    } else {
      console.log('Database pool closed');
    }
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const PORT = process.env.PORT || 2005;
const server = app.listen(PORT, () => {
  console.log(`✅ Server started on port ${PORT}`);
  testConnection();
});

server.timeout = 30000;

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
