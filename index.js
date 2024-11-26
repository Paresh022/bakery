const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const server = express();

server.use(bodyParser.json());

// Establish the database connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Password@123',
  database: 'bakery',
});

db.connect(function (error) {
  if (error) {
    console.log('Error Connecting to DB:', error.message);
  } else {
    console.log('Successfully Connected to DB');
  }
});

// Establish the port
server.listen(8085, function (error) {
  if (error) {
    console.log('Error starting server!');
  } else {
    console.log('Server started on port 8085!');
  }
});

// Create a new order when a customer buys products
server.post('/api/order/create', (req, res) => {
    const { userId, cartItems, totalPrice, paymentMethodId } = req.body;

    // Start a database transaction
    db.beginTransaction(function (err) {
        if (err) {
            return res.send({ status: false, message: 'Transaction failed: ' + err.message });
        }

        // Insert new order into the `orders` table
        const orderQuery = 'INSERT INTO orders (user_id, total_price, order_status, payment_method_id) VALUES (?, ?, ?, ?)';
        db.query(orderQuery, [userId, totalPrice, 'pending', paymentMethodId], function (error, orderResult) {
            if (error) {
                return db.rollback(() => {
                    res.send({ status: false, message: 'Error creating order: ' + error.message });
                });
            }

            const orderId = orderResult.insertId;

            // Insert items into `order_items` and update product stock
            const orderItems = cartItems.map(item => {
                return new Promise((resolve, reject) => {
                    const itemQuery = 'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)';
                    db.query(itemQuery, [orderId, item.productId, item.quantity, item.price], function (error) {
                        if (error) {
                            reject(error);
                        } else {
                            // Update product stock
                            const updateStockQuery = 'UPDATE products SET stock = stock - ? WHERE id = ?';
                            db.query(updateStockQuery, [item.quantity, item.productId], function (err) {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            });
                        }
                    });
                });
            });

            // Handle all promises for the cart items
            Promise.all(orderItems)
                .then(() => {
                    // Commit the transaction
                    db.commit(function (err) {
                        if (err) {
                            return db.rollback(() => {
                                res.send({ status: false, message: 'Error committing transaction: ' + err.message });
                            });
                        }
                        res.send({ status: true, message: 'Order placed successfully' });
                    });
                })
                .catch(err => {
                    db.rollback(() => {
                        res.send({ status: false, message: 'Error processing items: ' + err.message });
                    });
                });
        });
    });
});

// View orders for a specific user
server.get('/api/orders/:userId', (req, res) => {
  const userId = req.params.userId;
  const sql = 'SELECT * FROM orders WHERE user_id = ?';
  db.query(sql, [userId], (error, result) => {
    if (error) {
      res.send({ status: false, message: 'Error retrieving orders' });
    } else {
      res.send({ status: true, data: result });
    }
  });
});

// Get all products in an order (order items)
server.get('/api/order/items/:orderId', (req, res) => {
  const orderId = req.params.orderId;
  const sql = 'SELECT oi.*, p.name, p.price FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?';
  db.query(sql, [orderId], (error, result) => {
    if (error) {
      res.send({ status: false, message: 'Error retrieving order items' });
    } else {
      res.send({ status: true, data: result });
    }
  });
});
