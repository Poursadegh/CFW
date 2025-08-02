<script>
  import { onMount } from 'svelte';
  import { Search, MapPin, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-svelte';
  
  let jobId = '';
  let itinerary = null;
  let loading = false;
  let error = '';
  let polling = false;
  
  const API_BASE_URL = 'https://ai-itinerary-generator.your-subdomain.workers.dev';
  
  async function checkStatus() {
    if (!jobId.trim()) {
      error = 'Please enter a Job ID';
      return;
    }
    
    loading = true;
    error = '';
    itinerary = null;
    
    try {
      const response = await fetch(`${API_BASE_URL}/status/${jobId.trim()}`);
      const data = await response.json();
      
      if (response.ok) {
        itinerary = data;
        
        if (data.status === 'processing' && !polling) {
          startPolling();
        }
      } else {
        error = data.error || 'Failed to fetch status';
      }
    } catch (err) {
      error = 'Network error. Please try again.';
    } finally {
      loading = false;
    }
  }
  
  function startPolling() {
    polling = true;
    const poll = async () => {
      if (!polling) return;
      
      try {
        const response = await fetch(`${API_BASE_URL}/status/${jobId.trim()}`);
        const data = await response.json();
        
        if (response.ok) {
          itinerary = data;
          
          if (data.status === 'completed' || data.status === 'failed') {
            polling = false;
          } else {
            setTimeout(poll, 2000);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
        polling = false;
      }
    };
    
    setTimeout(poll, 2000);
  }
  
  function getStatusIcon(status) {
    switch (status) {
      case 'completed':
        return CheckCircle;
      case 'failed':
        return XCircle;
      case 'processing':
        return Loader2;
      default:
        return Clock;
    }
  }
  
  function getStatusColor(status) {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'processing':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  }
  
  function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    return new Date(timestamp.toDate()).toLocaleString();
  }
</script>

<main class="min-h-screen p-4">
  <div class="max-w-4xl mx-auto">
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold text-white mb-2">AI Itinerary Generator</h1>
      <p class="text-white/80">Check the status of your AI-generated travel itinerary</p>
    </div>
    
    <div class="bg-white rounded-lg shadow-lg p-6 mb-8">
      <div class="flex gap-4">
        <div class="flex-1">
          <label for="jobId" class="block text-sm font-medium text-gray-700 mb-2">
            Job ID
          </label>
          <div class="relative">
            <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              id="jobId"
              type="text"
              bind:value={jobId}
              placeholder="Enter your Job ID (e.g., job_1234567890_abc123)"
              class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              on:keydown={(e) => e.key === 'Enter' && checkStatus()}
            />
          </div>
        </div>
        <div class="flex items-end">
          <button
            on:click={checkStatus}
            disabled={loading}
            class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {#if loading}
              <Loader2 class="w-5 h-5 animate-spin" />
              Checking...
            {:else}
              <Search class="w-5 h-5" />
              Check Status
            {/if}
          </button>
        </div>
      </div>
    </div>
    
    {#if error}
      <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
        <div class="flex items-center gap-2">
          <XCircle class="w-5 h-5 text-red-600" />
          <span class="text-red-800">{error}</span>
        </div>
      </div>
    {/if}
    
    {#if itinerary}
      <div class="bg-white rounded-lg shadow-lg p-6 mb-8">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            {#if itinerary.status}
              <svelte:component this={getStatusIcon(itinerary.status)} class="w-6 h-6 {getStatusColor(itinerary.status)}" />
            {/if}
            <div>
              <h2 class="text-xl font-semibold text-gray-900">
                {itinerary.destination}
              </h2>
              <p class="text-gray-600">
                {itinerary.durationDays} day{itinerary.durationDays !== 1 ? 's' : ''} • 
                Status: <span class="font-medium {getStatusColor(itinerary.status)}">{itinerary.status}</span>
              </p>
            </div>
          </div>
          
          {#if itinerary.status === 'processing' && polling}
            <div class="flex items-center gap-2 text-blue-600">
              <Loader2 class="w-4 h-4 animate-spin" />
              <span class="text-sm">Polling for updates...</span>
            </div>
          {/if}
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div class="bg-gray-50 rounded-lg p-4">
            <p class="text-sm text-gray-600">Created</p>
            <p class="font-medium">{formatTimestamp(itinerary.createdAt)}</p>
          </div>
          {#if itinerary.completedAt}
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm text-gray-600">Completed</p>
              <p class="font-medium">{formatTimestamp(itinerary.completedAt)}</p>
            </div>
          {/if}
        </div>
        
        {#if itinerary.error}
          <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <h3 class="font-medium text-red-800 mb-2">Error</h3>
            <p class="text-red-700">{itinerary.error}</p>
          </div>
        {/if}
        
        {#if itinerary.itinerary && itinerary.itinerary.length > 0}
          <div class="space-y-6">
            <h3 class="text-lg font-semibold text-gray-900">Your Itinerary</h3>
            
            {#each itinerary.itinerary as day}
              <div class="border border-gray-200 rounded-lg p-6">
                <div class="flex items-center gap-3 mb-4">
                  <div class="bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-sm font-medium">
                    Day {day.day}
                  </div>
                  <h4 class="text-lg font-medium text-gray-900">{day.theme}</h4>
                </div>
                
                <div class="space-y-4">
                  {#each day.activities as activity}
                    <div class="flex gap-4">
                      <div class="w-20 text-sm font-medium text-gray-600 pt-1">
                        {activity.time}
                      </div>
                      <div class="flex-1">
                        <p class="text-gray-900 mb-1">{activity.description}</p>
                        <div class="flex items-center gap-1 text-sm text-gray-600">
                          <MapPin class="w-4 h-4" />
                          {activity.location}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    
    {#if !itinerary && !loading}
      <div class="bg-white rounded-lg shadow-lg p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">How to use</h3>
        <div class="space-y-3 text-gray-600">
          <p>1. Generate an itinerary using the API endpoint</p>
          <p>2. Copy the returned Job ID</p>
          <p>3. Paste the Job ID above to check the status</p>
          <p>4. View your personalized travel itinerary when complete</p>
        </div>
        
        <div class="mt-6 p-4 bg-blue-50 rounded-lg">
          <h4 class="font-medium text-blue-900 mb-2">API Endpoint</h4>
          <code class="text-sm text-blue-800">
            POST {API_BASE_URL}/generate
          </code>
        </div>
      </div>
    {/if}
  </div>
</main>

<style>
  input:focus {
    outline: none;
  }
  
  .animate-spin {
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style> 