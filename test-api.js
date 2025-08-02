#!/usr/bin/env node

const https = require('https');
const http = require('http');

const DEFAULT_WORKER_URL = 'https://ai-itinerary-generator.your-subdomain.workers.dev';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    if (options.body) {
      requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: jsonData
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function testAPI(workerUrl) {
  log('🧪 Starting API Tests...', 'blue');
  log(`Testing endpoint: ${workerUrl}\n`, 'yellow');

  let allTestsPassed = true;

  log('Test 1: API Info Endpoint', 'blue');
  try {
    const response = await makeRequest(`${workerUrl}/`);
    if (response.status === 200 && response.data.message) {
      log('✅ API info endpoint working', 'green');
      log(`   Message: ${response.data.message}`, 'green');
    } else {
      log('❌ API info endpoint failed', 'red');
      allTestsPassed = false;
    }
  } catch (error) {
    log(`❌ API info endpoint error: ${error.message}`, 'red');
    allTestsPassed = false;
  }

  log('\nTest 2: Generate Itinerary', 'blue');
  try {
    const testData = {
      destination: 'Tokyo, Japan',
      durationDays: 3
    };

    const response = await makeRequest(`${workerUrl}/generate`, {
      method: 'POST',
      body: JSON.stringify(testData)
    });

    if (response.status === 202 && response.data.jobId) {
      log('✅ Itinerary generation started', 'green');
      log(`   Job ID: ${response.data.jobId}`, 'green');
      
      log('\nTest 3: Check Status', 'blue');
      await testStatusCheck(workerUrl, response.data.jobId);
      
    } else {
      log('❌ Itinerary generation failed', 'red');
      log(`   Status: ${response.status}`, 'red');
      log(`   Response: ${JSON.stringify(response.data)}`, 'red');
      allTestsPassed = false;
    }
  } catch (error) {
    log(`❌ Itinerary generation error: ${error.message}`, 'red');
    allTestsPassed = false;
  }

  log('\nTest 4: Input Validation', 'blue');
  try {
    const invalidData = {
      destination: '',
      durationDays: 0
    };

    const response = await makeRequest(`${workerUrl}/generate`, {
      method: 'POST',
      body: JSON.stringify(invalidData)
    });

    if (response.status === 400) {
      log('✅ Input validation working', 'green');
    } else {
      log('❌ Input validation failed', 'red');
      allTestsPassed = false;
    }
  } catch (error) {
    log(`❌ Input validation error: ${error.message}`, 'red');
    allTestsPassed = false;
  }

  log('\nTest 5: CORS Headers', 'blue');
  try {
    const response = await makeRequest(`${workerUrl}/`, {
      headers: {
        'Origin': 'https://example.com'
      }
    });

    if (response.headers['access-control-allow-origin'] === '*') {
      log('✅ CORS headers present', 'green');
    } else {
      log('❌ CORS headers missing', 'red');
      allTestsPassed = false;
    }
  } catch (error) {
    log(`❌ CORS test error: ${error.message}`, 'red');
    allTestsPassed = false;
  }

  log('\n' + '='.repeat(50), 'blue');
  if (allTestsPassed) {
    log('🎉 All tests passed!', 'green');
  } else {
    log('❌ Some tests failed', 'red');
  }
  log('='.repeat(50), 'blue');
}

async function testStatusCheck(workerUrl, jobId) {
  log(`   Checking status for job: ${jobId}`, 'yellow');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    try {
      const response = await makeRequest(`${workerUrl}/status/${jobId}`);
      
      if (response.status === 200) {
        const status = response.data.status;
        log(`   Status: ${status}`, 'green');
        
        if (status === 'completed') {
          log('✅ Itinerary completed successfully', 'green');
          log(`   Destination: ${response.data.destination}`, 'green');
          log(`   Duration: ${response.data.durationDays} days`, 'green');
          if (response.data.itinerary && response.data.itinerary.length > 0) {
            log(`   Days generated: ${response.data.itinerary.length}`, 'green');
          }
          return true;
        } else if (status === 'failed') {
          log('❌ Itinerary generation failed', 'red');
          if (response.data.error) {
            log(`   Error: ${response.data.error}`, 'red');
          }
          return false;
        } else if (status === 'processing') {
          log(`   Still processing... (attempt ${attempts + 1}/${maxAttempts})`, 'yellow');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } else {
        log(`❌ Status check failed: ${response.status}`, 'red');
        return false;
      }
    } catch (error) {
      log(`❌ Status check error: ${error.message}`, 'red');
      return false;
    }
    
    attempts++;
  }
  
  log('❌ Status check timed out', 'red');
  return false;
}

async function main() {
  const workerUrl = process.argv[2] || DEFAULT_WORKER_URL;
  
  if (workerUrl === DEFAULT_WORKER_URL) {
    log('⚠️  Using default URL. Please provide your actual worker URL:', 'yellow');
    log('   node test-api.js https://your-worker-url.workers.dev', 'yellow');
    log('');
  }
  
  try {
    await testAPI(workerUrl);
  } catch (error) {
    log(`❌ Test execution failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { testAPI, makeRequest }; 