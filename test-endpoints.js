async function testModels() {
  const token = 'Bearer sk-2347adf51edac0fa-iazg1n-5bb68588';
  try {
    const res = await fetch('https://rinel-router.duckdns.org/v1/models', {
      headers: {
        'Authorization': token
      }
    });
    console.log('GET /v1/models status:', res.status);
    const data = await res.json();
    console.log('Models list:');
    if (data.data) {
      data.data.forEach(m => {
        console.log(`- ID: ${m.id}, Owned By: ${m.owned_by}`);
      });
    } else {
      console.log(data);
    }
  } catch (e) {
    console.error('Error fetching models:', e.message);
  }
}

testModels();
