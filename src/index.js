import admin from 'firebase-admin';
import { z } from 'zod';

const ActivitySchema = z.object({
  time: z.string(),
  description: z.string(),
  location: z.string()
});

const DaySchema = z.object({
  day: z.number(),
  theme: z.string(),
  activities: z.array(ActivitySchema)
});

const ItinerarySchema = z.object({
  status: z.enum(['completed', 'processing', 'failed']),
  destination: z.string(),
  durationDays: z.number(),
  createdAt: z.any(),
  completedAt: z.any().nullable(),
  itinerary: z.array(DaySchema),
  error: z.string().nullable()
});

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o';

function generateJobId() {
  return 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function createPrompt(destination, durationDays) {
  return `You are a professional travel planner. Create a detailed ${durationDays}-day itinerary for ${destination}.

Please return ONLY a valid JSON object with the following structure (no additional text or formatting):

{
  "itinerary": [
    {
      "day": 1,
      "theme": "Theme for the day (e.g., 'Historical Paris', 'Modern Tokyo')",
      "activities": [
        {
          "time": "Morning",
          "description": "Detailed activity description with practical tips",
          "location": "Specific location name"
        },
        {
          "time": "Afternoon", 
          "description": "Detailed activity description with practical tips",
          "location": "Specific location name"
        },
        {
          "time": "Evening",
          "description": "Detailed activity description with practical tips", 
          "location": "Specific location name"
        }
      ]
    }
  ]
}

Requirements:
- Include 3 activities per day (Morning, Afternoon, Evening)
- Provide specific, practical descriptions with insider tips
- Include exact location names
- Make activities realistic for the time of day
- Consider local culture and must-see attractions
- Ensure activities flow logically throughout the day
- Include practical tips like "pre-book tickets" or "best time to visit"

Return ONLY the JSON object, no other text.`;
}

async function callOpenAI(prompt, env, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are a professional travel planner. Always respond with valid JSON only.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('No content received from OpenAI');
      }

      let jsonResponse;
      try {
        jsonResponse = JSON.parse(content);
      } catch (parseError) {
        throw new Error(`Invalid JSON response from OpenAI: ${content.substring(0, 200)}...`);
      }

      return jsonResponse;
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt === retries) {
        throw error;
      }
      
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function processItinerary(jobId, destination, durationDays, env) {
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  const db = app.firestore();

  try {
    await db.collection('itineraries').doc(jobId).update({
      status: 'processing',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const prompt = createPrompt(destination, durationDays);
    const aiResponse = await callOpenAI(prompt, env);
    
    const itineraryData = {
      status: 'completed',
      destination,
      durationDays,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      itinerary: aiResponse.itinerary,
      error: null
    };

    const validatedData = ItinerarySchema.parse(itineraryData);
    await db.collection('itineraries').doc(jobId).update(validatedData);
    
    console.log(`Itinerary completed for job ${jobId}`);
  } catch (error) {
    console.error(`Error processing itinerary for job ${jobId}:`, error);
    
    await db.collection('itineraries').doc(jobId).update({
      status: 'failed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      error: error.message
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    try {
      const url = new URL(request.url);
      
      if (request.method === 'POST' && url.pathname === '/generate') {
        const body = await request.json();
        
        if (!body.destination || !body.durationDays) {
          return new Response(JSON.stringify({
            error: 'Missing required fields: destination and durationDays'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        if (typeof body.durationDays !== 'number' || body.durationDays < 1 || body.durationDays > 30) {
          return new Response(JSON.stringify({
            error: 'durationDays must be a number between 1 and 30'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        const jobId = generateJobId();
        
        const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
        const app = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        const db = app.firestore();
        
        await db.collection('itineraries').doc(jobId).set({
          status: 'processing',
          destination: body.destination,
          durationDays: body.durationDays,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          completedAt: null,
          itinerary: [],
          error: null
        });

        ctx.waitUntil(processItinerary(jobId, body.destination, body.durationDays, env));

        return new Response(JSON.stringify({
          jobId,
          message: 'Itinerary generation started'
        }), {
          status: 202,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      if (request.method === 'GET' && url.pathname.startsWith('/status/')) {
        const jobId = url.pathname.split('/')[2];
        
        if (!jobId) {
          return new Response(JSON.stringify({
            error: 'Job ID is required'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        try {
          const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
          const app = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
          const db = app.firestore();
          
          const docRef = db.collection('itineraries').doc(jobId);
          const docSnap = await docRef.get();
          
          if (!docSnap.exists) {
            return new Response(JSON.stringify({
              error: 'Job not found'
            }), {
              status: 404,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          }

          const data = docSnap.data();
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        } catch (error) {
          return new Response(JSON.stringify({
            error: 'Failed to fetch job status'
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
      }

      if (request.method === 'GET' && url.pathname === '/') {
        return new Response(JSON.stringify({
          message: 'AI Itinerary Generator API',
          endpoints: {
            'POST /generate': 'Generate a new itinerary',
            'GET /status/{jobId}': 'Check itinerary status'
          }
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      return new Response(JSON.stringify({
        error: 'Endpoint not found'
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
}; 