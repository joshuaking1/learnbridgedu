require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const winston = require('winston');

const app = express();
const PORT = process.env.PORT || 3010;

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'warming.log' })
    ]
});

// Define critical services
const services = [
    {
        name: 'auth',
        healthUrl: 'http://localhost:3000/api/auth/health',
        warmupUrl: 'http://localhost:3000/api/auth/warmup',
        priority: 1, // Highest priority
        // Common usage patterns (hours in 24h format)
        peakHours: [8, 9, 10, 13, 14, 15, 16] // Morning and after lunch peaks
    },
    {
        name: 'user',
        healthUrl: 'http://localhost:3001/api/users/health',
        warmupUrl: 'http://localhost:3001/api/users/warmup',
        priority: 2,
        peakHours: [8, 9, 10, 13, 14, 15, 16]
    },
    {
        name: 'learning-path',
        healthUrl: 'http://localhost:3007/api/learning-paths/health',
        warmupUrl: 'http://localhost:3007/api/learning-paths/warmup',
        priority: 3,
        peakHours: [9, 10, 11, 14, 15, 16] // Slightly different pattern
    }
];

// Utility to check if current hour is a peak hour for a service
const isInPeakHours = (service) => {
    const currentHour = new Date().getHours();
    return service.peakHours.includes(currentHour);
};

// Function to warm up a specific service
async function warmService(service) {
    try {
        // First check health
        const healthResponse = await axios.get(service.healthUrl);
        
        if (!healthResponse.data.warmedUp || 
            (healthResponse.data.lastWarmup && 
             Date.now() - new Date(healthResponse.data.lastWarmup).getTime() > 5 * 60 * 1000)) {
            
            // Service needs warming
            logger.info(`Warming up ${service.name} service`);
            const warmupResponse = await axios.post(service.warmupUrl);
            
            if (warmupResponse.data.warmedUp) {
                logger.info(`Successfully warmed up ${service.name} service`);
            } else {
                logger.warn(`Warm-up response for ${service.name} service indicates not warmed up`);
            }
        } else {
            logger.debug(`${service.name} service is already warm`);
        }
    } catch (error) {
        logger.error(`Error warming ${service.name} service:`, error.message);
    }
}

// Function to warm up all services based on priority and peak hours
async function warmAllServices() {
    logger.info('Starting warming cycle');
    
    // Sort services by priority
    const sortedServices = [...services].sort((a, b) => a.priority - b.priority);
    
    for (const service of sortedServices) {
        // Check if it's peak hours for this service
        if (isInPeakHours(service)) {
            logger.info(`Peak hours for ${service.name} service, prioritizing warm-up`);
            await warmService(service);
        } else {
            logger.debug(`Non-peak hours for ${service.name} service, using standard warm-up schedule`);
            await warmService(service);
        }
    }
    
    logger.info('Completed warming cycle');
}

// Schedule warm-ups
// Run every 5 minutes during peak hours, every 15 minutes otherwise
cron.schedule('*/5 * * * *', async () => {
    const currentHour = new Date().getHours();
    const isAnyServicePeakHour = services.some(service => service.peakHours.includes(currentHour));
    
    if (isAnyServicePeakHour) {
        logger.info('Peak hour detected, running priority warm-up');
        await warmAllServices();
    }
});

cron.schedule('*/15 * * * *', async () => {
    const currentHour = new Date().getHours();
    const isAnyServicePeakHour = services.some(service => service.peakHours.includes(currentHour));
    
    if (!isAnyServicePeakHour) {
        logger.info('Running standard warm-up cycle');
        await warmAllServices();
    }
});

// Health check endpoint for the warming controller itself
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'Warming Controller is Up!',
        monitoredServices: services.map(s => ({
            name: s.name,
            priority: s.priority,
            inPeakHours: isInPeakHours(s)
        }))
    });
});

// Start server
app.listen(PORT, () => {
    logger.info(`Warming Controller Service running on port ${PORT}`);
    // Initial warm-up
    warmAllServices();
});