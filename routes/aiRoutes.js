// routes/aiRoutes.js
const express = require('express');
const router = express.Router();
const GoogleGenAI = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

router.post('/generate-product-content', async (req, res) => {
  try {
    const { productName } = req.body;
    
    if (!productName || typeof productName !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Mandatory field "productName" is missing or structurally invalid.' 
      });
    }
    
    const prompt = `You are an expert copywriter and SEO architect for the premium e-commerce platform named Anritvox. 
    Generate exhaustive, professional, optimized high-conversion product information for a product named "${productName}". 
    You must return a JSON object containing a complete A-to-Z profile with exactly these keys:
    "short_description": A compelling 1-sentence hook highlighting the primary value proposition.
    "description": A beautiful, comprehensive 3-to-4 sentence engaging description emphasizing quality, craftsmanship, and performance.
    "features": An array of exactly 4 structural high-impact bullet points outlining benefits or performance advantages.
    "specifications": A string of key technical specs or dimensions suitable for an explicit specification table.
    "meta_title": A catchy, high-CTR SEO title strictly under 60 characters incorporating key terms.
    "meta_description": An explicit search snippet strictly under 160 characters optimized for click-through rate.
    "tags": A single string of 5 comma-separated highly relevant SEO keywords for discovery indexing.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    // Parse verified text result payload directly 
    const parsedData = JSON.parse(response.text);

    res.json({ success: true, data: parsedData });
  } catch (error) {
    console.error('[AI Generation Error]:', error);
    res.status(500).json({ success: false, error: 'Failed to generate AI content. Please ensure API keys are valid.' });
  }
});

module.exports = router;
