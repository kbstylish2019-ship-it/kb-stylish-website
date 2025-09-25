// Node 22 has native fetch

async function testSignup() {
  const url = 'https://poxjcaogjupsplrcliau.supabase.co/auth/v1/signup';
  const email = `test${Math.floor(Math.random() * 10000)}@example.com`;
  const password = 'TestPass123!';
  
  console.log(`Testing signup with email: ${email}`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBveGpjYW9nanVwc3BscmNsaWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1NjQ1MDUsImV4cCI6MjA3MzE0MDUwNX0.5gcfRhvo4PbfSXVPRsJhbmSn046-yjwaDiC92VGo62w'
      },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (!response.ok) {
      console.error('Signup failed:', data);
    } else {
      console.log('Signup successful!');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testSignup();
