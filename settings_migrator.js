const DefaultSettings = {
	"enabled": true,
	"autoCrafting": true,
    "autoDismantling": true,
    "autoSelling": false,
    "discardFilets": true,
    "discardCount": 500,
    "reUseFishSalad": true,
    "castDistance": 0,
    "useRandomDelay": false,
    "catchDelay": [2000, 8000],
    "moveItemDelay": [200, 500],

    "autoDismantleFishes": [
        206400, // Stone Moroko
        206401, // Azurecheek Carp
        206402, // Crayfish
        206403, // Clownfish
        206404, // Angelfish
        206405, // Black-fin Clownfish
        206406, // Squid
        206407, // Crucian Carp
        206408, // Sea Eel
        206409, // Tang Fish
        206410, // Freshwater Eel
        206411, // Octopus
        206412, // Marlin
        206413, // Prince Salmon
        206414, // Mottled Ray
        206415, // Catfish
        206416, // Channel Catfish
        206417, // Eldritch Carp
        206418, // Gula Shark
        206419, // Chroma Salmon
        206420, // Electric Eel
        206421, // Yellowfin
        206422, // Dipturus
        206423, // Stone Octopus
        206424, // Crimson Marlin
        206425, // Prism Carp
        206426, // Bluefin
        206427, // Golden Crayfish
        206428, // Crimson Squid
        206429, // Mossback
        206430, // Golden Eel
        206431, // Crimson Shark
        206432, // Specklefin
        206433, // Makaira
        206434, // Gluda Shark
        206435, // Shrieking Eel
        206500, // Giant Blue
        206501, // Golden Shark
        206502, // Fairy Snakehead
        206503, // Golden Sailfish
        206504, // Queen Salmon
        206505, // Golden Octopus
        206506, // Giant Blue
        206507, // Golden Ray
        206508, // Darkfin
        206509, // Golden Carp
    ],

    "autoSellFishes": [
        206400, // Stone Moroko
        206401, // Azurecheek Carp
        206402, // Crayfish
        206403, // Clownfish
        206404, // Angelfish
        206405, // Black-fin Clownfish
        206406, // Squid
        206407, // Crucian Carp
        206408, // Sea Eel
        206409, // Tang Fish
        206410, // Freshwater Eel
        206411, // Octopus
        206412, // Marlin
        206413, // Prince Salmon
        206414, // Mottled Ray
        206415, // Catfish
        206416, // Channel Catfish
        206417, // Eldritch Carp
        206418, // Gula Shark
        206419, // Chroma Salmon
        206420, // Electric Eel
        206421, // Yellowfin
        206422, // Dipturus
        206423, // Stone Octopus
        206424, // Crimson Marlin
        206425, // Prism Carp
        206426, // Bluefin
        206427, // Golden Crayfish
        206428, // Crimson Squid
        206429, // Mossback
        206430, // Golden Eel
        206431, // Crimson Shark
        206432, // Specklefin
        206433, // Makaira
        206434, // Gluda Shark
        206435, // Shrieking Eel
        206500, // Giant Blue
        206501, // Golden Shark
        206502, // Fairy Snakehead
        206503, // Golden Sailfish
        206504, // Queen Salmon
        206505, // Golden Octopus
        206506, // Giant Blue
        206507, // Golden Ray
        206508, // Darkfin
        206509, // Golden Carp
    ],    
};

module.exports = function MigrateSettings(from_ver, to_ver, settings) {
    if (from_ver === undefined) {
        // Migrate legacy config file
        return Object.assign(Object.assign({}, DefaultSettings), settings);
    } else if (from_ver === null) {
        // No config file exists, use default settings
        return DefaultSettings;
    } else {
        // Migrate from older version (using the new system) to latest one
        if (from_ver + 1 < to_ver) {
            // Recursively upgrade in one-version steps
            settings = MigrateSettings(from_ver, from_ver + 1, settings);
            return MigrateSettings(from_ver + 1, to_ver, settings);
        }
        
        // If we reach this point it's guaranteed that from_ver === to_ver - 1, so we can implement
        // a switch for each version step that upgrades to the next version. This enables us to
        // upgrade from any version to the latest version without additional effort!
        switch(to_ver)
        {
            default:
				let oldsettings = settings
				
				settings = Object.assign(DefaultSettings, {});
				
				for(let option in oldsettings) {
					if(settings[option]) {
						settings[option] = oldsettings[option]
					}
				}
				
				break;
        }
        
        return settings;
    }
}