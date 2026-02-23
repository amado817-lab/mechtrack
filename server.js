const express = require('express');
const cors = require('cors');
require('dotenv').config();console.log('API KEY loaded:', process.env.ANTHROPIC_API_KEY ? 'YES' : 'NO');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/api/lookup', async (req, res) => {
  const { vin } = req.query;

  if (!vin || vin.length !== 17) {
    return res.status(400).json({ error: 'Please provide a valid 17-character VIN.' });
  }

  try {
    const nhtsaRes = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
    const nhtsaData = await nhtsaRes.json();
    const results = nhtsaData.Results;
    const get = (v) => results.find(r => r.Variable === v)?.Value || '';

    const year      = get('Model Year');
    const make      = get('Make');
    const model     = get('Model');
    const trim      = get('Trim');
    const engine    = get('Displacement (L)');
    const cylinders = get('Engine Number of Cylinders');
    const driveType = get('Drive Type');
    const bodyClass = get('Body Class');

    if (!make || make === 'null' || !year) {
      return res.status(404).json({ error: 'Could not decode this VIN. Please double-check it.' });
    }

    const vehicleDesc = `${year} ${make} ${model}${trim ? ' ' + trim : ''}${engine ? ', ' + engine + 'L' : ''}${cylinders ? ' ' + cylinders + '-cylinder' : ''}`;

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are an expert automotive technician. Generate the complete OEM maintenance schedule for a ${vehicleDesc}.

Return ONLY valid JSON in this exact format, no markdown, no explanation:
{
  "schedule": [
    {
      "id": "oil_change",
      "name": "Oil & Filter Change",
      "description": "Replaces engine oil and filter to keep engine lubricated and clean.",
      "intervalMiles": 5000,
      "intervalMonths": 6,
      "priority": "critical"
    }
  ]
}

Include all standard services: oil change, tire rotation, air filter, cabin filter, spark plugs, brake fluid, coolant flush, transmission fluid, serpentine belt, timing belt check, battery, brake inspection. Use realistic OEM intervals for this exact vehicle.`
      }]
    });

    let rawText = message.content[0].text;
    rawText = rawText.replace(/\`\`\`json\n?/g, '').replace(/\`\`\`\n?/g, '').trim();
    const { schedule } = JSON.parse(rawText);

    res.json({ vehicle: { year, make, model, trim, engine, cylinders, driveType, bodyClass }, schedule });

  } catch (err) {
    console.error('Lookup error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ MechTrack server running on port ${PORT}`);
});
