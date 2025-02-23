const Response = require("./controllers/Response");
const Report = require("./models/Report");
const request = require('request');

function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}

function generateAnonymName(userId, postId) {
    // Combine userId and postId to create a unique hash seed
    const combinedId = userId + '_' + postId;
    const hash = simpleHash(combinedId).toString();

    // Engaging adjectives (social-friendly & unique)
    const adjectives = [
        "Radiant", "Enigmatic", "Mystic", "Ethereal", "Celestial", "Luminous", "Velvet", "Golden",
        "Crimson", "Azure", "Emerald", "Sapphire", "Amber", "Opalescent", "Gilded", "Silken",
        "Whispering", "Dancing", "Flickering", "Blazing", "Serene", "Majestic", "Harmonic", "Vivid",
        "Timeless", "Eclipsed", "Starlit", "Moonlit", "Sunlit", "Twilight", "Dreamlike", "Enchanted",
        "Nebulous", "Shadowy", "Illustrious", "Arcane", "Runic", "Magnetic", "Mirrored", "Shimmering",
        "Thunderous", "Galactic", "Hypernova", "Eclipse", "Starbound", "Borealis", "Lunar", "Solar"
    ];

    // Unique and engaging creatures (fantasy & modern mix)
    const animals = [
        "Phoenix", "Griffin", "Unicorn", "Dragon", "Pegasus", "Kraken", "Sphinx", "Chimera",
        "Mermaid", "Basilisk", "Centaur", "Hydra", "Yeti", "Leviathan", "Cerberus", "Fenrir",
        "Valkyrie", "Nymph", "Satyr", "Kitsune", "Garuda", "Roc", "Simurgh", "Quetzalcoatl",
        "Tengu", "Selkie", "Kelpie", "Banshee", "Djinn", "Ifrit", "Zephyr", "Aether",
        "Astronaut", "Cyberwolf", "Starfox", "Moonwalker", "NeonPanther", "VoidTiger", "SolarFalcon",
        "StormBear", "Galaxion", "NeonSphinx", "ShadowWraith", "LavaGolem", "ThunderWolf", "FrostDrake"
    ];

    // Generate an extra layer of uniqueness (randomized number suffix)
    const suffixNumbers = Array.from({ length: 10 }, (_, i) => i + 1); // Numbers 1-10 for more variety

    // Ensure the hash is long enough by converting it to a fixed-length string
    const extendedHash = (hash + simpleHash(hash)).toString().padStart(10, '0'); // 🔹 Ensure it's always long enough

    // 🔹 Ensure valid numeric indexes
    const adjectiveIndex = Math.abs(parseInt(extendedHash.substring(0, 3), 10) || 0) % adjectives.length;
    const animalIndex = Math.abs(parseInt(extendedHash.substring(3, 6), 10) || 0) % animals.length;
    const suffixIndex = Math.abs(parseInt(extendedHash.substring(6, 8), 10) || 0) % suffixNumbers.length;

    // Select words from the arrays
    const randomAdjective = adjectives[adjectiveIndex] || "Mysterious"; // 🔹 Default to prevent "undefined"
    const randomAnimal = animals[animalIndex] || "Entity"; // 🔹 Default to prevent "undefined"
    const randomSuffix = suffixNumbers[suffixIndex];

    return `${randomAdjective}_${randomAnimal}${randomSuffix}`;
}

// Example hashing function
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}


function withVotesInfo(entity, userId, postId) {
    const userVote = entity.votes.find(vote => vote.user == userId);

    let anonymName = entity.anonymName; // Use the anonymName from the entity if it's already set

    if (entity.anonyme && !anonymName) {
        anonymName = generateAnonymName(entity.user, postId); // Generate based on the entity's user ID
        console.log("Generated anonymName for anonymous entity:", anonymName);
    }

    return {
        ...entity.toObject(),
        voted: !userVote ? 0 : userVote.vote,
        votes: entity.votes.length
            ? entity.votes.map(vote => vote.vote).reduce((acc, curr) => acc + curr)
            : 0,
        anonymName,  // Attach the anonymous name only if the post/comment is anonymous
    };
}




module.exports = {
    generateAnonymName,
    withVotesInfo,
};
