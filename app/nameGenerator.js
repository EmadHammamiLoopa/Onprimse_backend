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
    // Combine userId and postId to create a unique input for hashing
    const combinedId = userId + '_' + postId;
    const hash = simpleHash(combinedId).toString();

    const adjectives = ["Quick", "Clever", "Witty", "Swift", "Silent", "Mighty", "Bold", "Fierce", "Gentle", "Noble", "Stealthy", "Brave", "Daring", "Sly", "Wise", "Loyal"];
    const animals = ["Eagle", "Falcon", "Panther", "Wolf", "Hawk", "Tiger", "Lion", "Bear", "Fox", "Jaguar", "Leopard", "Shark", "Cheetah", "Lynx", "Owl", "Raven"];

    // Ensure the hash is long enough by converting it to a fixed length string
    const extendedHash = (hash + simpleHash(hash)).toString();

    // Use more characters from the extended hash to increase variability
    const adjectiveIndex = parseInt(extendedHash.substring(0, 3), 10) % adjectives.length;
    const animalIndex = parseInt(extendedHash.substring(3, 6), 10) % animals.length;

    const randomAdjective = adjectives[adjectiveIndex];
    const randomAnimal = animals[animalIndex];

    return `${randomAdjective}_${randomAnimal}`;
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
