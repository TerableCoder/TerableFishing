let Readable;
// Happy new years update from TerableCoder
try {
    ({Readable} = require('tera-data-parser/lib/protocol/stream')); 
} catch (e){
    ({Readable} = require('tera-data-parser/protocol/stream'));
}

const CRAFTABLE_BAITS = [
	{name: "Bait II", itemId: 206001, abnormalityId: 70272, recipeId: 204100},
	{name: "Bait III", itemId: 206002, abnormalityId: 70273, recipeId: 204101},
	{name: "Bait IV", itemId: 206003, abnormalityId: 70274, recipeId: 204102},
	{name: "Bait V", itemId: 206004, abnormalityId: 70275, recipeId: 204103}
];

const RODS = [206700, 206701, 206702, 206703, 206704, 206705, 206706, 206707, 206708, 206709, 206710, 206711, 206712, 206713, 206714, 206715, 206716, 206717, 206718, 206719, 206720, 206721, 206722, 206723, 206724, 206725, 206726, 206727, 206728];

const WormId = [206005, 206006, 206007, 206008, 206009];

const AnglerToken = 204051;
const SkillTome = [209901, 209902, 209903, 209904];

module.exports = function EasyFishing(mod){
	const command = mod.command || mod.require.command;
	
	if(mod.proxyAuthor !== 'caali'){
		const options = require('./module').options
		if(options){
			const settingsVersion = options.settingsVersion
			if(settingsVersion){
				mod.settings = require('./' + (options.settingsMigrator || 'module_settings_migrator.js'))(mod.settings._version, settingsVersion, mod.settings)
				mod.settings._version = settingsVersion
			}
		}
	}

    let gameId = 0n,
    	currentBait = null,
    	lastBait = null,
    	playerLocation = {x: 0, y: 0, z: 0},
    	playerAngle = 0,
    	fishingRod = null,
    	waitingInventory = false,
    	dismantling = false,
    	selling = false,
    	itemsToProcess = [],
    	cannotDismantle = false,
    	crafting = false,
    	successCount = 0,
    	lastContact = {},
    	lastDialog = {},
    	discarding = false,
    	useSalad = false,
		checkingBait = false;
		
	let hasNego = mod.manager.isLoaded('auto-nego'),
		notifier = mod.manager.isLoaded('notifier') ? ( mod.require ? mod.require.notifier : require('tera-notifier')(mod) ) : false,
		pendingDeals = [],
		negoWaiting = false,
		timeout = null,
		amFishing = false,
		retryNumber = 0,
		stopFishing = false,
		consoleMsg = false,
		statFishedTiers = {},
		skillTomeTiers = {},
		startTime = null,
		salidActive = false,
		throwTime = null,
		numThrows = 0;

    function rand([min, max], lowerBound){
    	lowerBound = isNaN(lowerBound) ? Number.NEGATIVE_INFINITY : lowerBound;
    	min = parseInt(min);
    	max = parseInt(max);

    	if(isNaN(min) || isNaN(max)){
    		return lowerBound;
    	}

    	const result = Math.floor(Math.random() * (max - min + 1)) + min;
    	return result >= lowerBound ? result : lowerBound;
    }

    function validate(value, lowerBound, upperBound, defaultValue){
    	value = parseInt(value);
    	if(isNaN(value)){
    		return defaultValue;
    	}
    	if(value < lowerBound){
    		return lowerBound;
    	}
    	if(value > upperBound){
    		return upperBound;
    	}
    	return value;
    }
	
	function timeStamp(msg){
		let timeNow = new Date();
		let timeText = timeNow.getHours().toLocaleString(undefined, {minimumIntegerDigits: 2}) + ':' +
			timeNow.getMinutes().toLocaleString(undefined, {minimumIntegerDigits: 2}) + ':' + 
			timeNow.getSeconds().toLocaleString(undefined, {minimumIntegerDigits: 2});
		return ("[" + timeText + "] ");
	}
	
	command.add(['easyfishing', 'ef'], {
    	$none(){
    		mod.settings.enabled = !mod.settings.enabled;
        	command.message(`Easy fishing is now ${mod.settings.enabled ? "enabled" : "disabled"}.`);
    	},
    	craft(){
	    	mod.settings.autoCrafting = !mod.settings.autoCrafting;
	    	command.message(`Auto bait crafting is now ${mod.settings.autoCrafting ? "enabled" : "disabled"}.`);
    	},
    	dismantle(){ // add dismantleNow
        	mod.settings.autoDismantling = !mod.settings.autoDismantling;
    		command.message(`Auto dismantling fish is now ${mod.settings.autoDismantling ? "enabled" : "disabled"}.`);		
    	},
    	delay(){
    		mod.settings.useRandomDelay = !mod.settings.useRandomDelay;
    		command.message(`Random delay is now ${mod.settings.useRandomDelay ? "enabled" : "disabled"}.`);
    	},
    	distance(value){
    		mod.settings.castDistance = validate(value, 0, 18, 3);
    		command.message(`Cast distance set to ${mod.settings.castDistance}.`);
    	},
    	sell(){ // add sellNow
        	mod.settings.autoSelling = !mod.settings.autoSelling;
    		command.message(`Auto selling fish is now ${mod.settings.autoSelling ? "enabled" : "disabled"}.`);	
    	},
    	discard(amount){ // making this false will swap you between auto sell and discarding
    		amount = parseInt(amount);
    		if(isNaN(amount)){
    			mod.settings.discardFilets = !mod.settings.discardFilets;
    			command.message(`Discard filets is now ${mod.settings.discardFilets ? "enabled" : "disabled"}.`);
    		} else{
    			mod.settings.discardCount = amount;
    			command.message(`Discard filets count set to ${mod.settings.discardCount}.`);
    		}
    	},
    	salad(){
        	mod.settings.reUseFishSalad = !mod.settings.reUseFishSalad;
        	if(!mod.settings.reUseFishSalad) useSalad = false;
    		command.message(`Reuse fish salad is now ${mod.settings.reUseFishSalad ? "enabled" : "disabled"}.`);			
    	},
		stop(){
        	stopFishing = true;
    		command.message(`Fishing will stop soon...`);			
    	},
		cancel(){ // fk this shit
			/*
        	stopFishing = true;
    		command.message(`Fishing will cancel soon...`);
			clearTimeout(timeout);
			if(startTime == null){
				timeout = setTimeout(startFishing, 1000);
			} else{
				timeout = setTimeout(() => {
					startFishing();
					//mod.toServer('C_STOP_FISHING', 1, {});
					stopFishing = false;
					amFishing = false;
					calculateFishCaught();
				}, 1000);
			}
			*/
    	},
		start(){
			if(mod.settings.autoSelling && (!lastContact.gameId || !lastDialog.id)){
				mod.toClient('S_CHAT', 2, { channel: 21, authorName: 'KTC', message: "You have auto selling turned on, but you didn't talk to any NPC. It will NOT auto sell!!!!"});
			}
			statFishedTiers = {};
			skillTomeTiers = {};
			skillTomeTiers[1] = 0;
			skillTomeTiers[2] = 0;
			skillTomeTiers[3] = 0;
			skillTomeTiers[4] = 0;
			stopFishing = false;
			startTime = new Date().getTime();
    		command.message(`Fish logging started.`);
			clearTimeout(timeout);
			timeout = setTimeout(startFishing, 1000);
    	},
		snow(){
        	stopFishing = true;
    		command.message(`Selling, Fishing Once, Then Stopping...`);	
			startSelling();
    	},
		dnow(){
        	stopFishing = true;
    		command.message(`Dismantling, Fishing Once, Then Stopping...`);	
			startDismantling();
    	},
		consoleMsg(){
        	consoleMsg = !consoleMsg;
    		command.message(`consoleMsg = ${consoleMsg ? "enabled" : "disabled"}.`);			
    	},
		worm(y){
			if(!y){
				mod.settings.worm = !mod.settings.worm;
				command.message(`Worm-Deleter is now ${mod.settings.worm ? "enabled" : "disabled"}.`);
			} else if(isNaN(y) || y < 1){
				command.message(`${y} is an invalid argument. Type something like: ef worms 10`);
			} else{
				mod.settings.X = parseInt(y);
				command.message(`Deleting at ${mod.settings.X} Worms`);
				mod.saveSettings();
			}
    	},
		baf(){
			mod.settings.BAF = !mod.settings.BAF;
    		command.message(`Keeping BAFs is now ${mod.settings.BAF ? "enabled" : "disabled"}.`);	
    	},
		status(){
        	command.message(`Easy fishing is ${mod.settings.enabled ? "enabled" : "disabled"}.`);
    		command.message(`Selling ${mod.settings.autoSelling ? "enabled" : "disabled"}.`);
    		command.message(`Dismantling ${mod.settings.autoDismantling ? "enabled" : "disabled"}.`);	
    		command.message(`Discard ${mod.settings.discardFilets ? "enabled" : "disabled"} at ${mod.settings.discardCount}.`);
	    	command.message(`Bait crafting ${mod.settings.autoCrafting ? "enabled" : "disabled"}.`);
    		command.message(`Delay ${mod.settings.useRandomDelay ? "enabled" : "disabled"}.`);
    		command.message(`Cast distance ${mod.settings.castDistance}.`);
    		command.message(`Salad ${mod.settings.reUseFishSalad ? "enabled" : "disabled"}.`);
    		command.message(`BAFs ${mod.settings.BAF ? "enabled" : "disabled"}.`);	
			command.message(`Worm-Deleter ${mod.settings.worm ? "enabled" : "disabled"} at ${mod.settings.X}.`);
    	}
    });
	
	
	function calculateFishCaught(){
		//mod.toServer('C_STOP_FISHING', 1, {});
		if(notifier) notifier.messageafk(`Fishing Stopping...`);
		throwTime = null;
		numThrows = 0;
		if(startTime == null) return;
		let ms = new Date().getTime() - startTime;
		startTime = null;
		let totalSeconds = Math.floor(ms / 1000);
		let s = addZero(Math.floor(totalSeconds % 60));
		let m = addZero(Math.floor((totalSeconds / 60) % 60));
		let h = addZero(Math.floor(totalSeconds / 3600));
		
		let statFished = 0;
		let statSkillTomes = 0;
		for (let i in statFishedTiers){
			statFished += statFishedTiers[i];
		}
		for (let i in skillTomeTiers){
			statSkillTomes += skillTomeTiers[i];
		}
		if(statFished == 0){
			command.message('Fished out 0 fish. Time elapsed: ' + (h + ":" + m + ":" + s) + "."); 
			return;
		}
		command.message('Fished out: ' + statFished + ' fishes. Time elapsed: ' + (h + ":" + m + ":" + s) + ". Per fish: " + Math.round(totalSeconds / statFished) + " sec");
		command.message('Fishes: ');
		for (let i in statFishedTiers){
			command.message('Tier ' + i + ': ' + statFishedTiers[i]);
		}
		if(statSkillTomes == 0){
			command.message('Fished out 0 skill tomes.');
		} else{
			command.message('Skill Tomes: ');
			for (let i in skillTomeTiers){
				if(skillTomeTiers[i] > 0) command.message('Tier ' + i + ': ' + skillTomeTiers[i]);
			}
		}
		statFishedTiers = {};
		skillTomeTiers = {};
	}
	
	function addZero(i){
		if(i < 10) i = "0" + i;
		return i;
	}
	

	function startCraftingBait(){ // ADDED
		if(!crafting){
			successCount = 0;
		}
		crafting = true;
    	mod.toServer('C_START_PRODUCE', 1, {
    		recipe: lastBait.recipeId,
    		unk: 0
    	});
    }

    function startFishing(){
		if(!throwTime) throwTime = new Date().getTime(); // protect from rod spam
		numThrows++;
		let ms = new Date().getTime() - throwTime;
		let totalSeconds = Math.floor(ms / 1000);
		if(totalSeconds > 60){
			if(numThrows > 10){
				stopFishing = true;
				command.message(`Your rod is spamming, I'm fixing it now.`);	
				if(notifier) notifier.message(`Your rod is spamming, I'm fixing it now.`);
			}
			throwTime = new Date().getTime();
			numThrows = 0;
		}
		
		if(mod.game.me.inCombat){
			command.message('Cannot fish while in combat. Stopping...');
			amFishing = false;
			calculateFishCaught();
		} else if(stopFishing){
			command.message('Fishing Stopped.');
			amFishing = false;
			calculateFishCaught();
		} else{
			mod.toServer('C_USE_ITEM', 3, { // use rod
				gameId,
				id: fishingRod,
				dbid: 0,
				target: 0,
				amount: 1,
				dest: 0,
				loc: playerLocation,
				w: playerAngle,
				unk1: 0,
				unk2: 0,
				unk3: 0,
				unk4: true
			});
		}
		
    }

    function startDismantling(){
    	itemsToProcess = [];
    	waitingInventory = true;
    	dismantling = true;
    	mod.toServer('C_SHOW_INVEN', 1, {unk: 1});
    }

    function startSelling(){
    	if(lastContact.gameId && lastDialog.id){
	        itemsToProcess = [];
	    	waitingInventory = true;
	    	selling = true;
	    	mod.toServer('C_SHOW_INVEN', 1, {unk: 1});
    	} else{
    		if(mod.settings.autoDismantling){
    			command.message('Failed to start auto sell. Cannot find last merchant npc dialog. Dismantling...');
    			startDismantling();
    		} else{
    			command.message('Failed to start auto sell. Cannot find last merchant npc dialog. Stopping...');
				amFishing = false;
				calculateFishCaught();
    		}
    	}
    }

    function startDiscarding(){
    	discarding = true;
    	mod.toServer('C_SHOW_INVEN', 1, {unk: 1});
    }
	
	function checkBaitCount(){ // ADDED
        itemsToProcess = [];
        waitingInventory = true;
        checkingBait = true;
        mod.toServer('C_SHOW_INVEN', 1, {unk: 1});
    }
	
	
    function processItemsToDismantle(){
    	if(itemsToProcess.length > 0){
    		mod.toServer('C_REQUEST_CONTRACT', 1, {
    			type: 89,
    			unk2: 0,
    			unk3: 0,
    			unk4: 0,
    			name: "",
    			data: Buffer.alloc(0)
    		})
    	} else{
    		dismantling = false;
    	}
    }

    function processItemsToSell(){
    	if(itemsToProcess.length > 0){
    		mod.toServer('C_NPC_CONTACT', 2, lastContact);
    		let dialogHook;
			
			clearTimeout(timeout);
    		timeout = mod.setTimeout(() => {
    			if(dialogHook){
    				mod.unhook(dialogHook);
    				selling = false;
    				command.message("Failed to contact npc.");
		    		if(mod.settings.autoDismantling){
		    			command.message('Failed to contact npc. Dismantling...');
		    			startDismantling();
		    		} else{
		    			command.message('Failed to contact npc. Stopping...');
						amFishing = false;
						calculateFishCaught();
		    		}
    			}
    		}, 5000);

    		dialogHook = mod.hookOnce('S_DIALOG', 2, event => {
				mod.clearTimeout(timeout);
    			mod.toServer('C_DIALOG', 1, Object.assign(lastDialog, { id: event.id }));
    		});
    	} else{
    		selling = false;
    	}
    }

    mod.hook('C_NPC_CONTACT', 2, event => {
    	Object.assign(lastContact, event);
    });

    mod.hook('C_DIALOG', 1, event => {
    	Object.assign(lastDialog, event);
    });

    mod.hook('C_CAST_FISHING_ROD', 'raw', (code, data) => {
    	data[20] = validate(mod.settings.castDistance, 0, 18, 3);
    	return true;
    });

    mod.hook('S_END_PRODUCE', 1, event => {
    	if(crafting){
			if(event.success){
				successCount++;
				startCraftingBait();
			} else{
				crafting = false;
				
				if(successCount == 0){
					if(mod.settings.autoDismantling){
						if(mod.settings.autoSelling){
							mod.settings.autoSelling = false;
							command.message(`You've run out of Fish Fillets. Auto selling fish is now disabled.`);
						}
						startDismantling();
					} else{
						command.message("Failed to auto craft. Stopping...");
						amFishing = false;
						calculateFishCaught();
					}
				} else{
					mod.toServer('C_USE_ITEM', 3, { // use bait
		    			gameId,
						id: lastBait.itemId,
						dbid: 0n,
						target: 0n,
						amount: 1,
						dest: 0,
						loc: playerLocation,
						w: playerAngle,
						unk1: 0,
						unk2: 0,
						unk3: 0,
						unk4: true
					});
					clearTimeout(timeout);
					timeout = setTimeout(() => {
						if(currentBait){
							startFishing();
						} else{
							command.message("Failed to auto fish. Stopping...");
							amFishing = false;
							calculateFishCaught();
						}
					}, 1000);
				}
			}
		}
	});

	mod.hook('S_REQUEST_CONTRACT', 1, event => {
		if(dismantling || selling){
			if(event.type == 89){
				const handleContract = () => {
					let delay = mod.settings.useRandomDelay ? rand(mod.settings.moveItemDelay, 200) : 200;

					for (let item of itemsToProcess.slice(0, 20)){
						timeout = mod.setTimeout(() => {
							if(cannotDismantle) return;

							mod.toServer('C_RQ_ADD_ITEM_TO_DECOMPOSITION_CONTRACT', 1, {
								contract: event.id,
								dbid: item.dbid,
								id: item.id,
								count: 1
							});
						}, delay);
						delay += mod.settings.useRandomDelay ? rand(mod.settings.moveItemDelay, 200) : 200;
					}
					itemsToProcess = itemsToProcess.slice(20);
					timeout = mod.setTimeout(() => {
						mod.toServer('C_RQ_START_SOCIAL_ON_PROGRESS_DECOMPOSITION', 1, { contract: event.id });

						timeout = mod.setTimeout(() => {
							if(cannotDismantle){
								itemsToProcess = [];
								cannotDismantle = false;
								dismantling = false;

								mod.toServer('C_CANCEL_CONTRACT', 1, {
									type: 89,
									id: event.id
								});

								if(mod.settings.discardFilets && mod.settings.discardCount > 0){
									clearTimeout(timeout);
									timeout = setTimeout(startDiscarding, 2000);
								} else{
									//command.message(`Auto fishing stopping, cannot dismantle any more fish.`);
									//amFishing = false;
									clearTimeout(timeout);
									timeout = mod.setTimeout(() => {
										/*startDiscarding();
										mod.setTimeout(() => {
											mod.settings.autoSelling = true;
											command.message(`Max Fishing Fillets Reached. Auto selling fish is now ${mod.settings.autoSelling ? "enabled" : "disabled"}.`);
										}, 20000);*/
										mod.settings.autoSelling = true;
										command.message(`Max Fishing Fillets Reached. Auto selling fish is now ${mod.settings.autoSelling ? "enabled" : "disabled"}.`);
										startSelling();
									}, 2000);
								}
								return;
							}

							if(itemsToProcess.length > 0){
								handleContract();
							} else{
								dismantling = false;

								mod.toServer('C_CANCEL_CONTRACT', 1, {
									type: 89,
									id: event.id
								});
								clearTimeout(timeout);
								timeout = setTimeout(startFishing, 2000);
							}
						}, 3000);
					}, delay);
				};
				handleContract();
			} else if(event.type === 9){
				if(itemsToProcess.length > 0){
					let delay = mod.settings.useRandomDelay ? rand(mod.settings.moveItemDelay, 200) : 200;

					for (let item of itemsToProcess.slice(0, 8)){
						timeout = mod.setTimeout(() => {
							mod.toServer('C_STORE_SELL_ADD_BASKET', 1, {
								cid: gameId,
								npc: event.id,
								item: item.id,
								quantity: 1,
								slot: item.slot
							});
						}, delay);
						delay += mod.settings.useRandomDelay ? rand(mod.settings.moveItemDelay, 200) : 200;
					}
					itemsToProcess = itemsToProcess.slice(8);
					timeout = mod.setTimeout(() => {
						mod.toServer('C_STORE_COMMIT', 1, { gameId, contract: event.id });
					}, delay);
				} else{
					selling = false;
					mod.toServer('C_CANCEL_CONTRACT', 1, {
						type: 9,
						id: event.id
					});
					clearTimeout(timeout);
					timeout = setTimeout(startFishing, 2000);
				}
			}
		}
	});

    mod.hook('S_INVEN', 18, event => {
		for (const item of event.items){
			if(RODS.includes(item.id)){
				if(fishingRod == null || fishingRod == 206700) fishingRod = item.id;
			}
		}
		
		
    	if(!dismantling && !selling && !discarding && !checkingBait) return;

    	if(waitingInventory){
			
			if(checkingBait){ // ADDED
                for (const item of event.items){
                    if(item.id === lastBait.itemId){
                        checkingBait = false;
                        mod.toServer('C_USE_ITEM', 3, {
                            gameId,
                            id: lastBait.itemId,
                            dbid: 0,
                            target: 0,
                            amount: 1,
                            dest: 0,
                            loc: playerLocation,
                            w: playerAngle,
                            unk1: 0,
                            unk2: 0,
                            unk3: 0,
                            unk4: true
                        });
						clearTimeout(timeout);
                        timeout = mod.setTimeout(() => {
                            if(currentBait){
                                startFishing();
                            } else{
                                command.message("Failed to auto fish. Stoping...");
                            }
                        }, 1000);
                        return;
                    }
                }
				
                if(!event.more){
					waitingInventory = false;
                    startCraftingBait();
                    checkingBait = false;
                }
            } else if(selling || dismantling){
				for (const item of event.items){
					if(mod.settings[selling ? "autoSellFishes" : "autoDismantleFishes"].find(id => id == item.id)){
						itemsToProcess.push({dbid: item.dbid, id: item.id, slot: item.slot});
					} else if(mod.settings.worm && WormId.includes(item.id) && item.amount >= mod.settings.X){
						mod.toServer('C_DEL_ITEM', 2, {
							gameId,
							slot: (item.slot - 40),
							amount: item.amount
						});
					}
				}
				
				if(mod.settings.BAF){
					itemsToProcess = itemsToProcess.filter(obj => obj.id <= 206500);
				}
				
				if(!event.more){
					waitingInventory = false;
					if(dismantling){
						processItemsToDismantle();
					} else if(selling){
						processItemsToSell();
					}
				}
			}
			
    	}

    	if(discarding){
    		for (const item of event.items){
    			if(item.id == 204052){
    				discarding = false;
					command.message(`Discarding ${mod.settings.discardCount} filets.`);
    				mod.send('C_DEL_ITEM', 2, {
						gameId,
						slot: item.slot - 40,
						amount: Math.min(item.amount, mod.settings.discardCount)
					});
					clearTimeout(timeout);
					timeout = setTimeout(startFishing, 2000);
					break;
    			}
    		}

    		if(!event.more && discarding){
    			discarding = false;
    			command.message('Something really weird happened, could not discard filets. Stopping...');
				amFishing = false;
				calculateFishCaught();
    		}
    	}
    });

    mod.hook('S_LOGIN', 12, event => {
        ({gameId} = event);
		pendingDeals = [];
		negoWaiting = false;
		clearTimeout(timeout);
		amFishing = false;
		retryNumber = 0;
		stopFishing = false;
		fishingRod = null;
    });

    mod.hook('S_FISHING_BITE', 'raw', (code, data) => {
        if(!mod.settings.enabled) return;

		retryNumber = 0;
        const stream = new Readable(data);
        stream.position = 8;
        if(stream.uint64() === gameId){
            mod.toServer('C_START_FISHING_MINIGAME', 1, {});
        }
    });

	mod.hook('S_CAST_FISHING_ROD', 'raw', (code, data) => {
        const stream = new Readable(data);
        stream.position = 4;
        if(stream.uint64() === gameId){
       		stream.position = 25;
       		fishingRod = stream.uint32();
        }
    });    

	
	mod.hook('S_START_FISHING_MINIGAME', 1, event => {
		if(!mod.settings.enabled) return;
		
		/*if(gameId === event.gameId){
			let fishTier = salidActive ? event.level+3 : event.level; //data.readUInt8(16); // if salad, add 3 difficulty
			statFishedTiers[fishTier] = statFishedTiers[fishTier] ? statFishedTiers[fishTier]+1 : 1;
			command.message("Started fishing minigame, Tier " + fishTier);
			return;
		}*/
	});
	
	mod.hook('S_SYSTEM_MESSAGE_LOOT_ITEM', 1, event => {
		if(!mod.settings.enabled) return;
		
		if(SkillTome.includes(event.item)){
			let STindex = event.item % 10; // skill tome level = 1/2/3/4
			skillTomeTiers[STindex]++;
		}
		if(event.item == AnglerToken){
			let fishTier = -1;
			switch(event.amount){
			 case 30: fishTier = 11; break;
			 case 15: fishTier = 10; break;
			 case 12: fishTier = 9; break;
			 case 10: fishTier = 8; break;
			 case 8: fishTier = 7; break;
			 case 6: fishTier = 6; break;
			 case 4: fishTier = 5; break;
			 case 2: fishTier = 4; break; // 3/4
			 case 1: fishTier = 2; break; // 1/2
			}
			statFishedTiers[fishTier] = statFishedTiers[fishTier] ? statFishedTiers[fishTier]+1 : 1;
			/*statFishedTiers[11] = statFishedTiers[11] ? statFishedTiers[11]+1 : 1; // add BAF
			for (let i = 10; i > 0; i++){
				if(statFishedTiers[i] && statFishedTiers[i] > 0){ // remove BAF from other stat
					statFishedTiers[i]--;
					break;
				}
			}*/
		}
	});
	
    mod.hook('S_START_FISHING_MINIGAME', 'raw', (code, data) => {
        if(!mod.settings.enabled) return;
		
        const stream = new Readable(data);
        stream.position = 8;
        if(stream.uint64() === gameId){
			clearTimeout(timeout);
            timeout = mod.setTimeout(() => {
                mod.toServer('C_END_FISHING_MINIGAME', 1, {
                    success: true
                });
            }, mod.settings.useRandomDelay ? rand(mod.settings.catchDelay, 2000) : 2000);
            return false;
        }
    });
	
    mod.hook('C_USE_ITEM', 3, event => {
    	if(RODS.includes(event.id)){
			if(pendingDeals.length){
				command.message("Dealing with negotiations.");
				negoWaiting = true;
				for(let i = 0; i < pendingDeals.length; i++){
					mod.toClient('S_TRADE_BROKER_DEAL_SUGGESTED', 1, pendingDeals[i]);
					pendingDeals.splice(i--, 1);
				}
				if(stopFishing){ // so you don't have to wait an extra fish
					stopFishing = false;
					amFishing = false;
					calculateFishCaught();
					clearTimeout(timeout);
					timeout = setTimeout(() => {
						command.message("Fishing stopped.");
					}, 9000);
				} else{
					clearTimeout(timeout);
					timeout = setTimeout(startFishing, 18000);
				}
				return false;
			} 
			
			if(stopFishing){
				command.message("Fishing stopped.");
				stopFishing = false;
				amFishing = false;
				calculateFishCaught();
				return false;
			}
			
			if(mod.game.me.inCombat){
				command.message('Cannot fish while in combat. Stopping...');
				amFishing = false;
				calculateFishCaught();
				return false;
			}
			
			if(useSalad){
		    	mod.toServer('C_USE_ITEM', 3, {
					gameId,
					id: 206020,
					dbid: 0,
					target: 0,
					amount: 1,
					dest: 0,
					loc: playerLocation,
					w: playerAngle,
					unk1: 0,
					unk2: 0,
					unk3: 0,
					unk4: true
				});
				useSalad = false;
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 1000);
				return false;
			}
			negoWaiting = false;
			amFishing = true;

			if(mod.settings.autoSelling && (!lastContact.gameId || !lastDialog.id)){
				mod.toClient('S_CHAT', 2, { channel: 21, authorName: 'KTC', message: "You have auto selling turned on, but you didn't talk to any NPC. It will NOT auto sell!!!!"});
			}
		}
	});

	mod.hook('C_PLAYER_LOCATION', 5, event => { // the restriction on this caused playerLocation to sometimes never update, thus bait usage would fail
		Object.assign(playerLocation, event.loc);
		playerAngle = event.w;
	});
	
	mod.hook('S_SPAWN_ME', 3, event => {
        Object.assign(playerLocation, event.loc);
        playerAngle = event.w;
    });

    mod.hook('S_ABNORMALITY_BEGIN', 3, event => {
    	if(event.target === gameId){
			if(event.id === 70261){
				useSalad = false;
				salidActive = true;
			}
    		currentBait = CRAFTABLE_BAITS.find(obj => obj.abnormalityId === event.id) || currentBait;
    		lastBait = currentBait || lastBait;
    	}
    });

	mod.hook('S_ABNORMALITY_REFRESH', 1, event => {
		if(event.target === gameId && event.id === 70261){
			useSalad = false;
			salidActive = true;
		}
	});
	
    mod.hook('S_ABNORMALITY_END', 1, event => {
    	if(event.target !== gameId) return;

    	if(currentBait && currentBait.abnormalityId === event.id){
    		currentBait = null;
			clearTimeout(timeout);
			setTimeout(() => { // ADDED
                checkBaitCount();
            }, 5000);
    	} else if(event.id === 70261){
    		if(mod.settings.reUseFishSalad) useSalad = true;
			salidActive = false;
    	}
    });

    mod.hook('S_SYSTEM_MESSAGE', 1, event => {
		if(consoleMsg){
			let tempMsg = mod.parseSystemMessage(event.message);
			console.log(timeStamp() + "Logged Message");
			console.log(tempMsg);
		}
    	if(!mod.settings.enabled || (!amFishing && startTime == null)) return;
		
    	const msg = mod.parseSystemMessage(event.message);
    	if(msg){
    		if(msg.id === 'SMT_CANNOT_FISHING_FULL_INVEN'){ // full inven
    			if(mod.settings.autoSelling && !selling){
    				startSelling();
    			} else if(mod.settings.autoDismantling && !dismantling){
    				startDismantling();
    			}
    		} else if(msg.id === 'SMT_ITEM_CANT_POSSESS_MORE' && msg.tokens && msg.tokens['ItemName'] === '@item:204052'){ // too many fish fillets
    			cannotDismantle = true;
    		} else if(msg.id === 'SMT_CANNOT_FISHING_NON_AREA' && !negoWaiting){ // non-fishing area bug
				command.message("Non-fishing area bug? Retrying.");
				clearTimeout(timeout);
				retryNumber++;
				if(!stopFishing && retryNumber < 4){
					timeout = setTimeout(startFishing, 3000);
				} else{
					command.message("Fishing area couldn't be found. Stopping...");
					retryNumber = 0;
					amFishing = false;
					calculateFishCaught();
				}
			} else if(msg.id === 'SMT_PROHIBITED_ACTION_ON_RIDE' && !negoWaiting){ // mounted
				command.message("Can't fish while mounted. Retrying.");
				clearTimeout(timeout);
				retryNumber++;
				if(!stopFishing && retryNumber < 3){
					timeout = setTimeout(startFishing, 3000);
				} else{
					command.message("Can't fish while mounted. Stopping...");
					retryNumber = 0;
					amFishing = false;
					calculateFishCaught();
				}
			} else if(msg.id === 'SMT_BATTLE_SKILL_FAIL_COOL_TIME' || msg.id === 'SMT_SKILL_CANNOT_USE_ONCOMBAT'){ // using skill while trying to throw rod
				command.message("Can't fish while using a skill. Retrying.");
				clearTimeout(timeout);
				retryNumber++;
				if(!stopFishing && retryNumber < 2){
					timeout = setTimeout(startFishing, 3000);
				} else{
					command.message("Can't fish while using a skill. Stopping...");
					retryNumber = 0;
					amFishing = false;
					calculateFishCaught();
				}
			} else if(msg.id === 'SMT_FISHING_RESULT_CANCLE' && stopFishing && !pendingDeals.length){ // intentionally stopping
				command.message("Fishing stopped.");
				stopFishing = false;
				amFishing = false;
				calculateFishCaught();
			} else if(msg.id === 'SMT_FISHING_RESULT_CANCLE' && !pendingDeals.length){ // cancelled?
				command.message("Fishing cancelled. Retrying.");
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 3000);
			} else if(msg.id === 'SMT_FISHING_RESULT_CANCLE'){ // cancelled and deals pending
				command.message("Fishing cancelled, but we have negotiations to handle!");
				if(pendingDeals.length){ // double check
					command.message("Dealing with negotiations.");
					negoWaiting = true;
					for(let i = 0; i < pendingDeals.length; i++){
						mod.toClient('S_TRADE_BROKER_DEAL_SUGGESTED', 1, pendingDeals[i]);
						pendingDeals.splice(i--, 1);
					}
					if(stopFishing){ // so you don't have to wait an extra fish
						stopFishing = false;
						amFishing = false;
						calculateFishCaught();
						clearTimeout(timeout);
						timeout = setTimeout(() => {
							command.message("Fishing stopped.");
						}, 9000);
					} else{
						clearTimeout(timeout);
						timeout = setTimeout(startFishing, 9000);
					}
				} else{ // shouldn't happen
					command.message("Let me catch just one more fish! Then I'll negotiate.");
					clearTimeout(timeout);
					timeout = setTimeout(startFishing, 1000); // this should start the nego
				}
			} else if(msg.id === 'SMT_YOU_ARE_BUSY'){ // being party invited, traded, etc.
				command.message("You're busy. Retrying.");
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 3000);
			} else if(negoWaiting && !pendingDeals.length && msg.id === 'SMT_MEDIATE_SUCCESS_SELL'){ // finished all negotiations
				//command.message("Negotiations finished. Resuming."); // too much spam
				negoWaiting = false;
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 1000);
			} else if(msg.id === 'SMT_CANNOT_USE_ITEM_WHILE_CONTRACT'){ // still negotiating
				//command.message("Negotiations still inprogress. I'll try again later."); // too much spam
				negoWaiting = true;
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 9000);
			} else if(msg.id === 'SMT_CANNOT_FISHING_NON_BAIT'){ // no bait
				command.message("Can't fish without bait. Use a craftable bait then try again. Stopping...");
				amFishing = false;
				calculateFishCaught();
			} else if(msg.id === 'SMT_PET_CANT_ACTION_ORDER'){ // using pet, sometimes sends no message and fishing stops
				command.message("Can't fish while you're using a pet. Retrying.");
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 3000);
			} else if(msg.id === 'SMT_CANNOT_FISHING_NON_AREA'){ // non-fishing area bug while negoWaiting
			} else if(msg.id === 'SMT_PROHIBITED_ACTION_ON_RIDE'){ // mounted while negoWaiting
			} else if(msg.id === 'SMT_MEDIATE_SUCCESS_SELL'){ // sold item with more deals to finish
			
			} else if(msg.id === 'SMT_CANNOT_HAVE_MORE_ITEMS'){ // can't have more fish fillets
			} else if(msg.id === 'SMT_GENERAL_CANT_REG_ITEM_LIMIT'){ // can't have more fish fillets
			} else if(msg.id === 'SMT_ITEM_DELETED'){ // deleted fish fillets
			
			} else if(msg.id === 'SMT_MEDIATE_TRADE_CANCEL_ME'){ // negotiation canceled 
			} else if(msg.id === 'SMT_ITEM_USED'){ // used banker summon
			} else if(msg.id === 'SMT_WAREHOUSE_ITEM_INSERT'){ // insert to bank
			} else if(msg.id === 'SMT_WAREHOUSE_ITEM_DRAW'){ // withdraw from bank
			} else if(msg.id === 'SMT_GACHA_REWARD'){ // someone got a reward from a box
			} else if(msg.id === 'SMT_MAX_ENCHANT_SUCCEED'){ // enchant success message
			} else if(msg.id === 'SMT_GUILD_MEMBER_LOGON_NO_MESSAGE'){ // guild member login, empty login message
			} else if(msg.id === 'SMT_GUILD_MEMBER_LOGON'){ // guild member logon with login message
			} else if(msg.id === 'SMT_GUILD_MEMBER_LOGOUT'){ // guild member logout
			} else if(msg.id === 'SMT_GQUEST_NORMAL_ACCEPT'){ // guild quest accept
			} else if(msg.id === 'SMT_GQUEST_NORMAL_COMPLETE'){ // guild quest success
			} else if(msg.id === 'SMT_GQUEST_NORMAL_FAIL_OVERTIME'){ // guild quest failed
			} else if(msg.id === 'SMT_BATTLEFIELD_JOIN_START'){ // 3s or gridiron now open
			} else if(msg.id === 'SMT_BATTLEFIELD_JOIN_END'){ // 3s or gridiron now closed
			} else if(msg.id === 'SMT_GQUEST_NORMAL_CARRYOUT'){ // advanced toward completion of the guild quest
			} else if(msg.id === 'SMT_GUILD_WAR_DECLARE'){ // gvg declared
			} else if(msg.id === 'SMT_GUILD_WAR_WITHDRAW'){ // gvg withdrew
			} else if(msg.id === 'SMT_GUILD_WAR_SURRENDER'){ // gvg surrender
			} else if(msg.id === 'SMT_GUILDWAR_CANT_SURRENDER_NO_AUTHORITY'){ // gvg can't surrender?
			} else if(msg.id === 'SMT_GUILDWAR_ONGOING'){ // guild war happening
			} else if(msg.id === 'SMT_GC_MSGBOX_APPLYRESULT_1'){ // guild member accepted person into the guild
			} else if(msg.id === 'SMT_GC_MSGBOX_APPLYLIST_1'){ // join guild
			} else if(msg.id === 'SMT_GUILD_LOG_LEAVE'){ // leave guild
			} else if(msg.id === 'SMT_USE_ITEM_NO_EXIST'){ // item doesn't exist, aka lag when trading
			} else if(msg.id === 'SMT_NO_ITEM'){ // no bait
			} else if(msg.id === 'SMT_ITEM_CANT_POSSESS_MORE'){ // can't craft more bait, or can't have more fish fillets
			} else if(msg.id === 'SMT_ITEM_USED_ACTIVE'){ // used bait on
			} else if(msg.id === 'SMT_ITEM_USED_DEACTIVE'){ // used bait off
			} else if(msg.id === 'SMT_HIDDEN_QUEST_TASK_END'){ // completed vanguard
			} else if(msg.id === 'SMT_MEDIATE_REG_SUCCESS_ITEM'){ // listed item onto broker
			} else if(msg.id === 'SMT_MEDIATE_CONTRACT_BARGAIN'){ // nego for someone elses listed broker item
			} else if(msg.id === 'SMT_CANNOT_CONTINUE_CONTRACT'){ // can't nego for someone elses listed broker item
			} else if(msg.id === 'SMT_MEDIATE_SUCCESS_BUY'){ // bought item from broker
			} else if(msg.id === 'SMT_MEDIATE_TRADE_FINISH_USE_MONEY'){ // pay for the brokered item
			} else if(msg.id === 'SMT_MEDIATE_FAIL_CALCULATE'){ // too poor to buy from broker
			} else if(msg.id === 'SMT_MEDIATE_CALCULATE'){ // broker thing before claim
			} else if(msg.id === 'SMT_MEDIATE_CALCULATE_GET_ITEM'){ // get item from broker
			} else if(msg.id === 'SMT_MEDIATE_CALCULATE_GET_MONEY'){ // get money from item sold on broker
			} else if(msg.id === 'SMT_MEDIATE_DISCONNECT_CANCEL_OFFER_BY_ME'){ // cancel broker nego
			} else if(msg.id === 'SMT_LOOTED_MONEY'){ // vendored fish
			} else if(msg.id === 'SMT_ITEM_DECOMPOSE_COMPLETE'){ // dismantled fish
			} else if(msg.id === 'SMT_FIELD_EVENT_WORLD_ANNOUNCE'){ // superior guardian mission
			} else if(msg.id === 'SMT_PLAYTIME_TIMER'){ // you've been playing for x hours
			} else if(msg.id === 'SMT_KOREAN_RATING_TEENAGER_PROHIBITED'){ // logs off koreans?
			} else if(msg.id === 'SMT_VIPSYSTEM_GET_TOKEN'){ // log in tera rewards
			} else if(msg.id === 'SMT_USING_ACCOUNT_BENEFIT'){ // log in buff?
			} else if(msg.id === 'SMT_START_NPC_ARENA'){ // bamarama
			} else if(msg.id === 'SMT_FRIEND_REQUEST'){ // sent friend request
			} else if(msg.id === 'SMT_FRIEND_SOMEONE_ADDED_ME'){ // someone accepted friend request
			} else if(msg.id === 'SMT_FISHING_REWARD'){ // someone caught a BAF
			} else if(msg.id === 'SMT_FISHING_RESULT_SUCCESS'){ // caught a fish
			} else if(msg.id === 'SMT_ITEM_USED_NOT_CONSUME'){ // use brooch
			} else if(msg.id === 'SMT_CANNOT_GET_ITEM_FROM_WARE'){ // IDK bank stuff?
			} else if(msg.id === 'SMT_WAREHOUSE_GOLD_DRAW'){ // withdraw gold from bank
			} else if(msg.id === 'SMT_WAREHOUSE_GOLD_INSERT'){ // insert gold to bank
			} else if(msg.id === 'SMT_WAREHOUSE_FULL'){ // bank full
			} else if(msg.id === 'SMT_INVEN_FULL'){ // inventory full
			} else if(msg.id === 'SMT_DROPDMG_DAMAGE'){ // fall damage
			} else if(msg.id === 'SMT_OPPONENT_IS_BUSY'){ // can't duel, target busy
			} else if(msg.id === 'SMT_BATTLE_START'){ // start duel
			} else if(msg.id === 'SMT_BATTLE_END'){ // duel over
			} else if(msg.id === 'SMT_BATTLE_RESURRECT'){ // res, after duel?
			} else if(msg.id === 'SMT_GENERAL_NOT_IN_THE_WORLD'){ // /w offline player
			} else if(msg.id === 'SMT_CHAT_LINKTEXT_DISCONNECT'){ // fail to link item in chat?
			} else if(msg.id === 'SMT_CITYWAR_REWARD_RANKEXP'){ // CU guild exp
			} else if(msg.id === 'SMT_GUILD_INCENTIVE_SUCCESS'){ // CU victory
			} else if(msg.id === 'SMT_ACCOMPLISH_ACHIEVEMENT_GRADE_ALL'){ // achievement laurel achieved
			} else if(msg.id === 'SMT_ARTISAN_CANT_PRODUCE_FULL_INVEN'){ // can't craft, inventory full
			} else if(msg.id === 'SMT_BF_SEND_REWARD_TO_PARCEL'){ // full inventory, reward sent to mail
			} else if(msg.id === 'SMT_DISMISS_PARTY_SUCCEED'){ // drop/disband party
			} else if(msg.id === 'SMT_ACHIEVEMENT_CLEAR_MESSAGE_OPPONENT'){ // achievement something
			} else if(msg.id === 'SMT_MEDIATE_CANT_CONTRACT_ALREADY_CONTRACT_OPPONENT'){ // reject trade
			} else if(msg.id === 'SMT_FRIEND_RECEIVE_HELLO'){ // got greeted
			} else if(msg.id === 'SMT_FRIEND_SOMEONE_REQUEST_ME'){ // friend request
			} else if(msg.id === 'SMT_FRIEND_ADD_SUCCESS'){ // added friend
			} else if(msg.id === 'SMT_ACCOMPLISH_ACHIEVEMENT_GRADE_GUILD'){ // +8
			} else if(msg.id === 'SMT_TRADE_BROKER_CANT_SEARCH_ALL'){ // empty broker search
			} else if(msg.id === 'SMT_INVEN_NOT_ENOUGH_MONEY'){ // too poor to buy item
			} else if(msg.id === 'SMT_PARTY_LOOT_ITEM_PARTYPLAYER'){ // party member got fish
			} else if(msg.id === 'SMT_PARTYBOARD_RECORDED_YOUR_LIST'){ // idk
				console.log(timeStamp() + "Something fishy is going on here...");
				console.log(msg);
			} else if(msg.id === 'SMT_CUSTOMIZING_NOT_ENOUGH_CUSTOMIZING_SLOT'){ // idk
				console.log(timeStamp() + "Something fishy is going on here...");
				console.log(msg);
			} else if(msg.id === 'SMT_GET_ENCHANT_SUCCEED'){ // something with enchanting
				console.log(timeStamp() + "Something fishy is going on here...");
				console.log(msg);
			} else if(msg.id === 'SMT_TRADE_CANCEL'){ // IDK broker stuff?
				console.log(timeStamp() + "Something fishy is going on here...");
				console.log(msg);
			} else{
				console.log(timeStamp() + "Something fishy is going on here...");
				console.log(msg);
			}
			// TODO make easyfishing cancel command, jk hard af~
			// TODO make easyfishing display message during all failure cases ~ maybe~
			// see if ef start works while fishing? maybe~
			// make it not try to Dismantle and Sell at same time
			// make nego ing someone or getting summoned not make your rod spazm
			// add nego to EF
    	}
    });
	
	mod.hook('S_TRADE_BROKER_DEAL_SUGGESTED', 1, event => { // store nego request
		if(mod.settings.enabled && amFishing && hasNego && !negoWaiting && event.offeredPrice === event.sellerPrice){
			for(let i = 0; i < pendingDeals.length; i++){
				let deal = pendingDeals[i];
				if(deal.playerId == event.playerId && deal.listing == event.listing) pendingDeals.splice(i--, 1);
			}
			pendingDeals.push(event);
			command.message("Negoiation suggested, I'll address it after this fish.");
			return false;
		}
	});
	
    mod.hook('C_CHAT', 1, event => {
    	if(event.channel === 10 && mod.settings.enabled){
    		return false;
    	}
    });
}
