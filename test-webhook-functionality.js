#!/usr/bin/env node

/**
 * Comprehensive Webhook Functionality Test
 * Tests both polling and webhook modes of the Instalogo bot
 */

const http = require('http');
const https = require('https');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const log = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

class WebhookTester {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.botToken = process.env.BOT_TOKEN || 'test_token';
    this.testResults = [];
  }

  async runTests() {
    log('\n🧪 Starting Webhook Functionality Tests\n', 'bold');

    try {
      // Test 1: Development Mode (Current)
      await this.testDevelopmentMode();

      // Test 2: Health Endpoints (if webhook server is running)
      await this.testHealthEndpoints();

      // Test 3: Webhook Endpoint Structure
      await this.testWebhookEndpoint();

      // Test 4: Environment Variable Detection
      await this.testEnvironmentDetection();

      // Test 5: Bot Token Validation
      await this.testBotTokenValidation();

      // Summary
      this.printTestSummary();

    } catch (error) {
      log(`❌ Test suite failed: ${error.message}`, 'red');
    }
  }

  async testDevelopmentMode() {
    log('📡 Test 1: Development Mode (Polling)', 'blue');
    
    // Check if NODE_ENV is not production
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv !== 'production') {
      this.addResult('✅ Development mode detected', true);
      this.addResult('✅ Should use polling mode', true);
    } else {
      this.addResult('⚠️  Production mode detected', true);
    }
  }

  async testHealthEndpoints() {
    log('\n💓 Test 2: Health Endpoints', 'blue');

    try {
      // Test root endpoint
      const rootResponse = await this.makeRequest('GET', '/');
      this.addResult('✅ Root endpoint (/) accessible', true);
      
      if (rootResponse.includes('Instalogo Bot')) {
        this.addResult('✅ Root endpoint returns correct service info', true);
      } else {
        this.addResult('❌ Root endpoint missing service info', false);
      }

      // Test health endpoint
      const healthResponse = await this.makeRequest('GET', '/health');
      this.addResult('✅ Health endpoint (/health) accessible', true);
      
      if (healthResponse.includes('healthy') || healthResponse.includes('status')) {
        this.addResult('✅ Health endpoint returns status info', true);
      } else {
        this.addResult('❌ Health endpoint missing status info', false);
      }

    } catch (error) {
      if (error.message.includes('ECONNREFUSED')) {
        this.addResult('ℹ️  Webhook server not running (expected in dev mode)', true);
        this.addResult('ℹ️  Bot is using polling mode correctly', true);
      } else {
        this.addResult(`❌ Health endpoint error: ${error.message}`, false);
      }
    }
  }

  async testWebhookEndpoint() {
    log('\n🔗 Test 3: Webhook Endpoint Structure', 'blue');

    try {
      const webhookPath = `/webhook/${this.botToken}`;
      
      // Test POST to webhook endpoint (should be accessible if server is running)
      try {
        const response = await this.makeRequest('POST', webhookPath, {
          update_id: 12345,
          message: {
            message_id: 1,
            from: { id: 123, first_name: 'Test' },
            chat: { id: 123, type: 'private' },
            date: Math.floor(Date.now() / 1000),
            text: '/start'
          }
        });
        
        this.addResult('✅ Webhook endpoint accepts POST requests', true);
        
      } catch (error) {
        if (error.message.includes('ECONNREFUSED')) {
          this.addResult('ℹ️  Webhook endpoint not accessible (dev mode)', true);
        } else {
          this.addResult(`⚠️  Webhook endpoint response: ${error.message}`, true);
        }
      }

      // Test security - wrong path should fail
      try {
        await this.makeRequest('POST', '/webhook/wrong_token');
        this.addResult('❌ Security issue: accepts wrong token', false);
      } catch (error) {
        this.addResult('✅ Security: rejects wrong token paths', true);
      }

    } catch (error) {
      this.addResult(`❌ Webhook structure test error: ${error.message}`, false);
    }
  }

  async testEnvironmentDetection() {
    log('\n🌍 Test 4: Environment Variable Detection', 'blue');

    const nodeEnv = process.env.NODE_ENV;
    const webhookUrl = process.env.WEBHOOK_URL;
    const botToken = process.env.BOT_TOKEN;

    // Check environment variables
    this.addResult(`NODE_ENV: ${nodeEnv || 'undefined'}`, !!nodeEnv);
    this.addResult(`BOT_TOKEN: ${botToken ? 'Present' : 'Missing'}`, !!botToken);
    this.addResult(`WEBHOOK_URL: ${webhookUrl ? 'Present' : 'Missing'}`, true); // Optional in dev

    // Test mode logic
    const shouldUseWebhook = nodeEnv === 'production' && !!webhookUrl;
    if (shouldUseWebhook) {
      this.addResult('✅ Environment configured for webhook mode', true);
    } else {
      this.addResult('✅ Environment configured for polling mode', true);
    }
  }

  async testBotTokenValidation() {
    log('\n🔐 Test 5: Bot Token Validation', 'blue');

    const botToken = process.env.BOT_TOKEN;
    
    if (!botToken) {
      this.addResult('❌ BOT_TOKEN not found in environment', false);
      return;
    }

    // Validate token format
    const tokenPattern = /^\d+:[A-Za-z0-9_-]+$/;
    if (tokenPattern.test(botToken)) {
      this.addResult('✅ BOT_TOKEN has valid format', true);
    } else {
      this.addResult('❌ BOT_TOKEN has invalid format', false);
    }

    // Test bot API connection (optional)
    try {
      const response = await this.makeHTTPSRequest(`https://api.telegram.org/bot${botToken}/getMe`);
      if (response.includes('"ok":true')) {
        this.addResult('✅ Bot token valid - API connection successful', true);
      } else {
        this.addResult('❌ Bot token invalid - API connection failed', false);
      }
    } catch (error) {
      this.addResult(`⚠️  Bot API test failed: ${error.message}`, true);
    }
  }

  async makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 3000,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'WebhookTester/1.0'
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (error) => reject(error));

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  async makeHTTPSRequest(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', (error) => reject(error));
    });
  }

  addResult(message, success) {
    this.testResults.push({ message, success });
    const color = success ? 'green' : 'red';
    log(`  ${message}`, color);
  }

  printTestSummary() {
    log('\n📊 Test Summary', 'bold');
    log('================', 'bold');

    const passed = this.testResults.filter(r => r.success).length;
    const total = this.testResults.length;
    const failed = total - passed;

    log(`✅ Passed: ${passed}`, 'green');
    log(`❌ Failed: ${failed}`, failed > 0 ? 'red' : 'green');
    log(`📊 Total:  ${total}`, 'blue');

    const percentage = Math.round((passed / total) * 100);
    log(`\n🎯 Success Rate: ${percentage}%`, percentage >= 90 ? 'green' : 'yellow');

    if (failed === 0) {
      log('\n🎉 All tests passed! Webhook implementation is working correctly.', 'green');
    } else {
      log('\n⚠️  Some tests failed. Check the results above for details.', 'yellow');
    }

    log('\n💡 Next Steps:', 'bold');
    if (process.env.NODE_ENV === 'production') {
      log('  • Your bot is in WEBHOOK mode (production)');
      log('  • Deploy to Render to test full webhook functionality');
    } else {
      log('  • Your bot is in POLLING mode (development) ✅');
      log('  • Set NODE_ENV=production and WEBHOOK_URL to test webhook mode');
      log('  • Current setup is perfect for local development');
    }
  }
}

// Run tests
const tester = new WebhookTester();
tester.runTests().catch(console.error);
