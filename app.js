var express = require("express");
var mysql = require("mysql2");
const multer = require("multer");
var fileuploader = require("express-fileupload");
var app = express();
// const nodemailer = require("nodemailer");
app.get("/", function (req, resp) {
  resp.sendFile(process.cwd() + "/public/index.html");
});
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(fileuploader());

app.listen(2005, function () {
  console.log("Server Started");
});

// const nodemailer = require("nodemailer");
const fileUpload = require('express-fileupload');
app.use(fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
}));
app.get("/", function (req, resp) {
  resp.sendFile(process.cwd() + "/public/index.html");
});
app.use(express.static("public"));
app.use(fileuploader());
app.use(express.json());
app.use(fileUpload());

app.use(express.urlencoded(true));
//==========DataBase
var dbConfig = {
  host: "127.0.0.1",
  user: "root",
  password: "cgg@65830",
  database: "erp",
  dateStrings: true
}

var dbCon = mysql.createConnection(dbConfig);
dbCon.connect(function (err) {
  if (err == null)
    console.log("Connected Successfully");
  else
    resp.send(err);
})

//==================Log In================
app.get("/chk-login-submit", function (req, resp) {
  dbCon.query("select * from erp.register where username=? && password=? ", [req.query.kuchemail, req.query.kuchpwd], function (err, resultJSONTable) {
    if (err == null) {
      if (resultJSONTable.length > 0) {
        if (resultJSONTable[0].status == 1 || resultJSONTable[0].status == 2) {
          // Send the status in the response body, not as an HTTP status code
          resp.status(200).send(resultJSONTable[0].status.toString());
        } else {
          resp.status(403).send("USER BLOCKED");
        }
      } else {
        resp.status(401).send("INVALID EMAIL OR PASSWORD");
      }
    } else {
      // Respond with a 500 status code for server errors
      resp.status(500).send("Server Error");
    }
  });
});

app.get("/submit", function (req, resp) {
  const { productName, orderQuantity, costPrice, sellingPrice } = req.query;

  // Query to check if the product with the same name and cost price exists
  dbCon.query(
    "SELECT * FROM erp.inventory WHERE product_name = ? AND cp = ?",
    [productName, costPrice],
    function (err, result) {
      if (err) {
        resp.send(err); // Send error response
      } else if (result.length > 0) {
        // Product with the same name and cost price exists, update the quantity
        dbCon.query(
          "UPDATE erp.inventory SET quantity = quantity + ? WHERE product_name = ? AND cp = ?",
          [orderQuantity, productName, costPrice],
          function (updateErr) {
            if (updateErr) {
              resp.send(updateErr);
            } else {
              resp.send("Quantity updated successfully");
            }
          }
        );
      } else {
        // Product does not exist, insert a new record
        dbCon.query(
          "INSERT INTO erp.inventory(product_name, quantity, cp, sp) VALUES(?,?,?,?)",
          [productName, orderQuantity, costPrice, sellingPrice],
          function (insertErr) {
            if (insertErr) {
              resp.send(insertErr);
            } else {
              resp.send("Record saved successfully");
            }
          }
        );
      }
    }
  );
});

app.get("/getInventory", (req, resp) => {
  dbCon.query("SELECT * FROM erp.inventory", (err, results) => {
    if (err) {
      resp.status(500).send("Error fetching inventory data");
    } else {
      resp.json(results);
    }
  });
});

app.post('/updateInventory', (req, res) => {
  const { itemId, quantity } = req.body;

  // SQL query to update the inventory
  const query = "UPDATE erp.inventory SET quantity = ? WHERE id = ?";
  dbCon.query(query, [quantity, itemId], (err, result) => {
    if (err) {
      console.error("Error updating inventory:", err);
      return res.status(500).send("Internal Server Error");
    }
    res.send("Inventory updated successfully");
  });
});

app.post('/saveStatistics', (req, res) => {
  const { totalItemsSold, totalValueGet } = req.body;

  const query = "INSERT INTO erp.statistics (total_items_sold, total_value_get, timestamp) VALUES (?, ?, NOW())";
  dbCon.query(query, [totalItemsSold, totalValueGet], (err, result) => {
    if (err) {
      console.error('Error saving statistics:', err);
      return res.status(500).json({ message: 'Failed to save statistics' });
    }
    res.status(200).json({ message: 'Statistics saved successfully' });
  });
});

app.get('/api/statistics', (req, res) => {
  const query = `
    SELECT day, SUM(total_value_get) AS total_revenue 
    FROM statistics 
    GROUP BY day 
    ORDER BY FIELD(day, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday');
  `;
  dbCon.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching data:', err.message);
      return res.status(500).send('Database query failed');
    }
    res.json(results);
  });
});


// Add a financial record
app.post('/api/financial-records', (req, res) => {
  const { customer_id, amount, status, bills } = req.body;
  const query = 'INSERT INTO financial_records (customer, amount, status, bills,timestamp) VALUES (?, ?, ?, ?,NOW())';
  dbCon.query(query, [customer_id, amount, status, bills || null], (err, results) => {
    if (err) {
      res.status(500).json({ error: 'Failed to add record' });
      return;
    }
    res.status(201).json({ message: 'Record added successfully', recordId: results.insertId });
  });
});

app.get("/get-angular-all-records", function (req, resp) {
  //fixed                               //same seq. as in table
  dbCon.query("SELECT * FROM financial_records ;", function (err, resultTableJSON) {
    if (err == null)
      resp.send(resultTableJSON);
    else
      resp.send(err);
  })
})

app.get('/api/orders', async (req, res) => {
  try {
    // Ensure you await the query result to get data
    const [orders] = await dbCon.promise().query('SELECT * FROM financial_records ORDER BY timestamp DESC LIMIT 5');
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get("/add-employee", function (req, resp) {
  const { workerName, workerId, workerUsername, workerPassword } = req.query;

  if (!workerName || !workerId || !workerUsername || !workerPassword) {
    return resp.status(400).send("Missing required fields");
  }

  const query = "INSERT INTO register (id, name, username, password, status) VALUES (?, ?, ?, ?, 2)";
  dbCon.query(query, [workerId, workerName, workerUsername, workerPassword], function (err, result) {
    if (err) {
      console.error("Database error:", err);
      return resp.status(500).send("Failed to add worker");
    }
    resp.status(200).send("Worker added successfully");
  });
});

app.get('/get-angular-employee-records', (req, res) => {
  const sql = "SELECT * FROM register where status!=1";
  dbCon.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error fetching records");
    } else {
      res.json(results);
    }
  });
});


app.get("/do-angular-delete", function (req, resp) {
  //saving data in table
  var id = req.query.idkuch;


  //fixed                             //same seq. as in table
  dbCon.query("delete from register where id=?", [id], function (err, result) {
    if (err == null) {
      if (result.affectedRows == 1)
        resp.send("Account Removed Successfully!");
      else
        resp.send("Inavlid id");
    }
    else
      resp.send(err);
  })
})
///=================
app.get("/do-angular-block", function (req, resp) {
  var id = req.query.idkuch;


  dbCon.query("update  register set status=0 where id=? ", [id], function (err, result) {
    if (err == null) {
      if (result.affectedRows == 1) {
        resp.send("Updated Successfully..")
      }
      else {
        resp.send("No such account exists");
      }
    }
    else {
      resp.send(err);
    }
  })

})

//===================
app.get("/do-angular-resume", function (req, resp) {
  var id = req.query.idkuch;


  dbCon.query("update  register set status=2 where id=? ", [id], function (err, result) {
    if (err == null) {
      if (result.affectedRows == 1) {
        resp.send("Updated Successfully..")
      }
      else {
        resp.send("No such account exists");
      }
    }
    else {
      resp.send(err);
    }
  })

})

app.get('/api/workers', (req, res) => {
  const query = 'SELECT * FROM register WHERE status = 2';
  dbCon.query(query, (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send('Error fetching workers');
    } else {
      res.json(results);
    }
  });
});

app.post('/api/worker-info', (req, res) => {
  const { username } = req.body;

  dbCon.query('SELECT * FROM register WHERE username = ?', [username], (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch worker info' });
    }

    if (result.length > 0) {
      res.json({ worker: result[0] });
    } else {
      res.status(404).json({ error: 'Worker not found' });
    }
  });
});

// Endpoint to save a new message
app.post('/api/save-message', (req, res) => {
  const { chat, name } = req.body;  // Get message and worker name from the request body
  const timestamp = new Date();  // Get the current timestamp
  const status = 2;  // Assuming status 0 means message sent by worker

  // Insert the message into the database
  const query = 'INSERT INTO communication (chat, status, name, timestamp) VALUES (?, ?, ?, ?)';
  dbCon.execute(query, [chat, status, name, timestamp], (err, results) => {
    if (err) {
      console.error('Error saving message:', err);
      return res.status(500).json({ message: 'Error saving message' });
    }
    res.status(200).json({ message: 'Message saved successfully', results });
  });
});

app.post('/sendMessage', (req, res) => {
  const { chat, name } = req.body; // Get chat message and name from request body
  const status = 1; // Assuming 1 is the status for sent messages
  const timestamp = new Date(); // Get current timestamp

  const query = 'INSERT INTO communication (chat, status, name, timestamp) VALUES (?, ?, ?, ?)';
  dbCon.execute(query, [chat, status, name, timestamp], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error saving message' });
    }
    res.status(200).json({ message: 'Message sent successfully' });
  });
});

app.post('/api/fetch-messages', (req, res) => {
  const workerName = req.body.workerName; // Assuming worker name is sent in the request body

  const query = 'SELECT * FROM communication WHERE name = ? ORDER BY timestamp ASC';
  dbCon.query(query, [workerName], (error, results) => {
    if (error) {
      return res.status(500).json({ error: 'Error fetching messages' });
    }
    res.json({ messages: results });
  });
});


// Assuming you have MySQL connection setup and Express.js server
app.get('/fetchMessages', (req, res) => {
  const workerName = req.query.workerName; // workerName is passed from the frontend

  const query = `SELECT * FROM communication WHERE name = ? ORDER BY timestamp ASC`;

  dbCon.query(query, [workerName], (err, results) => {
    if (err) {
      console.error("Error fetching messages: ", err);
      res.status(500).send("Internal Server Error");
      return;
    }
    res.json(results); // Send the messages as a JSON response
  });
});

app.get('/getTotalRevenue', (req, res) => {
  const query = 'SELECT SUM(amount) AS total_revenue, COUNT(order_id) AS total_orders FROM financial_records'; // Modify this query based on your actual table structure

  dbCon.query(query, (err, results) => {
    if (err) {
      return res.status(500).send('Database query failed');
    }

    const totalRevenue = results[0].total_revenue || 0;
    const totalOrders = results[0].total_orders || 0;

    // Sending both totalRevenue and totalOrders
    res.json({ totalRevenue, totalOrders });
  });
});

app.get('/getTotalQuantity', (req, res) => {
  const query = 'SELECT SUM(quantity) AS total_quantity FROM inventory'; // Modify this query based on your actual table structure

  dbCon.query(query, (err, results) => {
    if (err) {
      return res.status(500).send('Database query failed');
    }

    const totalquantity = results[0].total_quantity || 0;

    res.json({ totalquantity });
  });
});

app.get('/getTotalEmployee', (req, res) => {
  const query = 'SELECT COUNT(id) AS total_employee FROM register where status=2'; // Modify this query based on your actual table structure

  dbCon.query(query, (err, results) => {
    if (err) {
      return res.status(500).send('Database query failed');
    }

    const totalemployee = results[0].total_employee || 0;

    res.json({ totalemployee });
  });
});

app.get('/getRevenueData', (req, res) => {
  const query = `
      SELECT DAYNAME(timestamp) AS day, SUM(total_value_get) AS total_revenue
      FROM statistics
      GROUP BY DAYNAME(timestamp)
      ORDER BY DAYNAME(timestamp);`;

  dbCon.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching data:', err);
      return res.status(500).send('Database error');
    }
    res.json(results);
  });
});

app.get('/getInventoryStatus', (req, res) => {
  const query = `
      SELECT 
          product_name AS category, 
          quantity,
          CASE 
              WHEN quantity = 0 THEN 'Out of Stock'
              WHEN quantity < 10 THEN 'Low Stock'
              ELSE 'Sufficient Stock'
          END AS status
      FROM inventory;
  `;
  
  dbCon.query(query, (err, results) => {
      if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to fetch inventory data.' });
      }
      res.json(results);
  });
});

app.post('/api/low-stock', (req, res) => {
  const query = 'SELECT product_name, quantity FROM inventory WHERE quantity <= 10';
  
  dbCon.query(query, (error, results) => {
      if (error) {
          return res.status(500).json({ error: 'Error fetching low stock items' });
      }
      res.json(results);  // Return the low stock items as JSON
  });
});

app.get('/api/sales-summary', (req, res) => {
  const query = `
      SELECT
          SUM(amount) AS totalRevenue,
          COUNT(order_id) AS totalOrders,
          AVG(amount) AS averageOrderValue
      FROM financial_records
      WHERE status = 'Completed'
  `;

  dbCon.query(query, (error, results) => {    
      if (error) {
          console.error('Database query failed:', error);
          return res.status(500).json({ error: 'Database query failed' });
      }

      const { totalRevenue, totalOrders, averageOrderValue } = results[0];
      res.json({
          totalRevenue: totalRevenue || 0,
          totalOrders: totalOrders || 0,
          averageOrderValue: averageOrderValue || 0
      });
  });
});

app.get('/api/weekly-sales', (req, res) => {
  const query = `
      SELECT
          day,
          SUM(total_value_get) AS total_sales
      FROM
          statistics
      WHERE
          timestamp >= CURDATE() - INTERVAL 7 DAY
      GROUP BY
          day
      ORDER BY
          FIELD(day, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday');
  `;
  
  dbCon.query(query, (error, results) => {
      if (error) {
          res.status(500).json({ error: 'Database query failed' });
          return;
      }

      // Send the results to the frontend
      res.json(results);
  });
});