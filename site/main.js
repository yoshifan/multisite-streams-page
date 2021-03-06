// API references:
// https://github.com/justintv/Twitch-API/blob/master/README.md
// http://developers.hitbox.tv/
//
// The following Javascript module pattern is from:
// http://stackoverflow.com/a/1479341

var Main = (function() {
    
    var requestStatusE = null;
    var mediaContainerEs = {};
    var mediaElementArrays = {};
    var mediaObjArrays = {};
    
    var SITE_NAMES = ['Twitch', 'Hitbox', 'Nico', 'Cavetube'];
    var SITE_NAMES_TO_MODULES = {
        'Twitch': Twitch,
        'Hitbox': Hitbox,
        'Nico': Nico,
        'Cavetube': Cavetube
    };
    var mediaTypesToSites = null;
    
    
    
    function haveEnabledSite(siteName) {
        if (siteName === 'Twitch') {
            return Settings.get('twitchEnabled');
        }
        else if (siteName === 'Hitbox') {
            return Settings.get('hitboxEnabled');
        }
        else if (siteName === 'Nico') {
            return Settings.get('nicoEnabled');
        }
        else if (siteName === 'Cavetube') {
            return Settings.get('cavetubeEnabled');
        }
    }
    
    
    
    function showNotification(notificationText) {
        var $notificationArea = $('div#notifications');
        
        $notificationArea.text(notificationText);
        $notificationArea.show();
    }
    
    function updateRequestStatus(
        siteName, numTotalRequests, numCompletedRequests) {
    
        // Look for an element of id request-status-<siteName>. This is the
        // element where we show this site's requests status.
        var statusId = 'request-status-' + siteName;
        var siteStatusE = document.getElementById(statusId);
        // If that element doesn't exist yet, then create it.
        if (!siteStatusE) {
            siteStatusE = document.createElement('span');
            siteStatusE.id = statusId;
            requestStatusE.appendChild(siteStatusE);
        }
    
        // Update the status.
        if (numTotalRequests === numCompletedRequests) {
            // All sent requests have completed
            siteStatusE.textContent = "";
            $(siteStatusE).hide();
        }
        else {
            // Still some requests left to go
            siteStatusE.textContent = 
                siteName + ": " + numCompletedRequests.toString() + " of "
                + numTotalRequests.toString();
            $(siteStatusE).show();
        }
        
        // If we know a particular media section is done (due to all the
        // relevant sites' requests being done), AND there were no media found
        // for that section, then update the placeholder text accordingly.
        //
        // Here we loop over each media type.
        $.each(mediaTypesToSites, function(mediaType, sites) {
                
            var allSitesWithThisMediaAreDone =
                mediaTypesToSites[mediaType].every(function(siteModule){
                    return siteModule.requestsAreDone();
                });
                
            if (allSitesWithThisMediaAreDone) {
                // All sites dealing with this media type have completed all
                // of their requests.
                //
                // If the section is still empty, change the placeholder text
                // to reflect this.
                var mediaContainerE = mediaContainerEs[mediaType];
                var text;
                if (mediaType === 'videos') {
                    text = "No " + mediaType + " found";
                }
                else {
                    text = "No live " + mediaType;
                }
                $(mediaContainerE).find('span.empty-section-text').text(text);
            }
        });
        
        // Check if there are any pending requests from any site.
        // If not:
        // - Hide the entire request status container.
        // - Show the page footer. (Showing this earlier makes it move all
        //   the place during page loading, which seems weird.)
        var requestsAreDone = SITE_NAMES.every(function(siteName){
            return SITE_NAMES_TO_MODULES[siteName].requestsAreDone();
        });
        if (requestsAreDone) {
            $(requestStatusE).hide();
            $('#footer').show();
        }
        else {
            $(requestStatusE).show();
        }
    }
    
    
    
    function getMediaCompareFunc(mediaType) {
        var sortType;
        if (mediaType === 'streams') {
            sortType = Settings.get('sortStreams');
        }
        else if (mediaType === 'hosts') {
            sortType = Settings.get('sortHosts');
        }
        else if (mediaType === 'games') {
            sortType = Settings.get('sortGames');
        }
        else if (mediaType === 'videos') {
            sortType = 'videoDateDesc';
        }
        
        var compareFunc;
        if (sortType === 'channelsAsc') {
            compareFunc = function(a, b) {
                return parseInt(a.channelCount) - parseInt(b.channelCount);
            };
        }
        else if (sortType === 'channelsDesc') {
            compareFunc = function(a, b) {
                return parseInt(b.channelCount) - parseInt(a.channelCount);
            };
        }
        else if (sortType === 'uptimeAsc') {
            compareFunc = function(a, b) {
                return b.startDate - a.startDate;
            };
        }
        else if (sortType === 'uptimeDesc') {
            compareFunc = function(a, b) {
                return a.startDate - b.startDate;
            };
        }
        else if (sortType === 'videoDateDesc') {
            compareFunc = function(a, b) {
                return parseInt(b.unixTimestamp) - parseInt(a.unixTimestamp);
            };
        }
        else if (sortType === 'viewersAsc') {
            compareFunc = function(a, b) {
                return parseInt(a.viewCount) - parseInt(b.viewCount);
            };
        }
        else if (sortType === 'viewersDesc') {
            compareFunc = function(a, b) {
                return parseInt(b.viewCount) - parseInt(a.viewCount);
            };
        }
        
        return compareFunc;
    }
    
    function addMediaThumbnail(obj, $thumbnailCtnr) {
        /* Add a stream or video thumbnail. */
        if (obj.site === 'Twitch') {
            $thumbnailCtnr.addClass('twitch');
        }
        else if (obj.site === 'Hitbox') {
            $thumbnailCtnr.addClass('hitbox');
        }
        else if (obj.site === 'Nico') {
            $thumbnailCtnr.addClass('nico');
        }
        else if (obj.site === 'Cavetube') {
            $thumbnailCtnr.addClass('cavetube');
        }
        
        var $thumbnail = $('<img>');
        $thumbnail.attr('class', 'media-thumbnail');
        $thumbnail.attr('src', obj.thumbnailUrl);
        $thumbnailCtnr.append($thumbnail);
    }
    
    function addGameDisplay(obj, $mediaE, $thumbnailCtnr) {
        /* Add a display indicating the game being played, for a
        stream, video, or host. */
        
        if (Settings.get('gameDisplay') === 'boximage') {
            // Game as box image
            if (obj.gameName !== null && obj.gameName !== "Not supported") {
                var $gameImageCtnr = $('<a>');
                $gameImageCtnr.attr('href', obj.gameLink);
                $thumbnailCtnr.append($gameImageCtnr);
            
                var $gameImage = $('<img>');
                $gameImage.attr('class', 'game-image');
                $gameImage.attr('src', obj.gameImage);
                $gameImage.attr('title', obj.gameName);
                $gameImageCtnr.append($gameImage);
            }
        }
        else if (Settings.get('gameDisplay') === 'name') {
            // Game as name text
            var $game = $('<div>');
            $game.attr('class', 'media-game');
            if (obj.gameName === null) {
                $game.text("No game selected");
            }
            else if (obj.gameName === "Not supported") {
                $game.text("-");
            }
            else {
                $game.text(obj.gameName);
            }
            $mediaE.append($game);
        }
        // Else, game display is 'none'
    }
    
    function addSiteIndicator(obj, $textContainer) {
        /* Add a colored icon/symbol to denote which site this media
        item is from.
        The icon/symbol is just an empty span whose appearance is determined
        entirely by CSS. */
        var $siteIndicator = $('<span>');
        $siteIndicator.addClass('site-indicator');
        if (obj.site === 'Twitch') {
            $siteIndicator.addClass('twitch');
        }
        else if (obj.site === 'Hitbox') {
            $siteIndicator.addClass('hitbox');
        }
        else if (obj.site === 'Nico') {
            $siteIndicator.addClass('nico');
        }
        else if (obj.site === 'Cavetube') {
            $siteIndicator.addClass('cavetube');
        }
        $textContainer.append($siteIndicator);
    }
    
    function addMediaItemSorted(
        mediaE, obj, mediaEs, objs, container, compareFunc) {
            
        var index = Util.sortedLocation(obj, objs, compareFunc);
        // Add stream element to the page in sorted order
        if (index >= 0) {
            $(mediaE).insertAfter(mediaEs[index]);
        }
        else {
            // index is -1, indicating that this goes at the beginning
            $(container).prepend(mediaE);
        }
        // Add to sorted list of stream objs, which we maintain so we
        // can find the sorted order of each element
        objs.splice(index + 1, 0, obj);
        // Add to sorted list of stream elements, which we maintain so we
        // can refer to these for insertAfter()
        mediaEs.splice(index + 1, 0, mediaE);
    }
    
    
    
    function addStreams(pendingStreams) {
        
        var container = mediaContainerEs['streams'];
        var streamEs = mediaElementArrays['streams'];
        var streamObjs = mediaObjArrays['streams'];
        
        var compareFunc = getMediaCompareFunc('streams');
        
        if (streamEs.length === 0 && pendingStreams.length > 0) {
            $(container).find('span.empty-section-text').remove();
        }
        
        var isSortedByUptime =
            Settings.get('sortStreams').indexOf('uptime') !== -1;
        
        pendingStreams.forEach(function(obj) {
                
            var $streamE = $('<a>');
            $streamE.attr('href', obj.channelLink);
            $streamE.attr('title', obj.streamTitle);
            
            var $thumbnailCtnr = $('<div>');
            $thumbnailCtnr.addClass('thumbnail-ctnr stream');
            $streamE.append($thumbnailCtnr);
            
            addMediaThumbnail(obj, $thumbnailCtnr);
            
            var $title = $('<div>');
            // Hitbox streams may have no title.
            $title.text(obj.streamTitle || "(No title)");
            $streamE.append($title);
            
            addGameDisplay(obj, $streamE, $thumbnailCtnr);
            
            var $channelNameAndViews = $('<div>');
            
            var $textSpan1 = $('<span>');
            var uptimeStr = Util.dateObjToHMElapsed(obj.startDate);
            if (isSortedByUptime) {
                $textSpan1.text(uptimeStr + " (" + obj.viewCount + ")");
            }
            else {
                $textSpan1.text(obj.viewCount + " (" + uptimeStr + ")");
            }
            $channelNameAndViews.append($textSpan1);
            
            addSiteIndicator(obj, $channelNameAndViews);
            
            var $textSpan2 = $('<span>');
            $textSpan2.text(obj.channelName);
            $channelNameAndViews.append($textSpan2);
            
            $streamE.append($channelNameAndViews);
            
            addMediaItemSorted(
                $streamE[0], obj, streamEs, streamObjs, container, compareFunc
            );
        });
    }
    
    
    function addHosts(pendingHosts) {
        
        var container = mediaContainerEs['hosts'];
        var hostEs = mediaElementArrays['hosts'];
        var hostObjs = mediaObjArrays['hosts'];
        
        var compareFunc = getMediaCompareFunc('hosts');
        
        if (Settings.get('mergeHosts') === true) {
            
            var uniqueHosts = {};
            pendingHosts.forEach(function(obj) {
                var name = obj.streamerName
                if (uniqueHosts.hasOwnProperty(name)) {
                    // Already seen this streamer hosted by at least one other
                    // channel.
                    var existingObj = uniqueHosts[name]
                    existingObj.hostCount += 1;
                    if (existingObj.hostCount === 2) {
                        // Currently: hoster1
                        // Want: hoster1 & hoster2
                        existingObj.hosterName =
                            existingObj.hosterName + " & " + obj.hosterName;
                    }
                    else if (existingObj.hostCount >= 3) {
                        // Currently: hoster1 & hoster2
                        // Want: hoster1 & x others
                        var andIndex = existingObj.hosterName.indexOf('&');
                        existingObj.hosterName =
                            existingObj.hosterName.slice(0, andIndex) + "& "
                            + (existingObj.hostCount-1).toString() + " others";
                    }
                }
                else {
                    obj.hostCount = 1;
                    uniqueHosts[name] = obj;
                }
            });
            
            // Make pendingHosts an array version of uniqueHosts (which is
            // an object)
            pendingHosts = [];
            for (var streamerName in uniqueHosts) {
                if (!uniqueHosts.hasOwnProperty(streamerName)) {continue;}
                pendingHosts.push(uniqueHosts[streamerName]);
            }
        }
        
        if (hostEs.length === 0 && pendingHosts.length > 0) {
            $(container).find('span.empty-section-text').remove();
        }
        
        pendingHosts.forEach(function(obj) {
            
            var $hostE = $('<a>');
            $hostE.attr('href', obj.channelLink);
            $hostE.attr('title', obj.streamTitle);
            
            var $thumbnailCtnr = $('<div>');
            $thumbnailCtnr.addClass('thumbnail-ctnr stream');
            $hostE.append($thumbnailCtnr);
            
            addMediaThumbnail(obj, $thumbnailCtnr);
            
            var $hostingText = $('<div>');
            $hostingText.text(obj.hosterName + " hosting " + obj.streamerName);
            $hostE.append($hostingText);
            
            var $title = $('<div>');
            // Hitbox streams may have no title.
            $title.text(obj.streamTitle || "(No title)");
            $title.attr('class', 'minor-text');
            $hostE.append($title);
            
            addGameDisplay(obj, $hostE, $thumbnailCtnr);
            
            var $channelNameAndViews = $('<div>');
            
            var $textSpan1 = $('<span>');
            $textSpan1.text(obj.viewCount);
            $channelNameAndViews.append($textSpan1);
            
            addSiteIndicator(obj, $channelNameAndViews);
            
            var $textSpan2 = $('<span>');
            $textSpan2.text(obj.streamerName);
            $channelNameAndViews.append($textSpan2);
            
            $hostE.append($channelNameAndViews);
            
            addMediaItemSorted(
                $hostE[0], obj, hostEs, hostObjs, container, compareFunc
            );
        });
    }
    
    
    function addGames(pendingGames) {
        
        var container = mediaContainerEs['games'];
        var gameEs = mediaElementArrays['games'];
        var gameObjs = mediaObjArrays['games'];
        
        var compareFunc = getMediaCompareFunc('games');
        
        if (gameEs.length === 0 && pendingGames.length > 0) {
            $(container).find('span.empty-section-text').remove();
        }
        
        pendingGames.forEach(function(obj) {
            
            var $gameE = $('<a>');
            $gameE.attr('href', obj.gameLink);
            $gameE.attr('title', obj.name);
            
            var $gameImage = $('<img>');
            $gameImage.attr('class', 'followed-game');
            $gameImage.attr('src', obj.gameImage);
            $gameE.append($gameImage);
            
            var $gameName = $('<div>');
            $gameName.text(obj.name);
            $gameE.append($gameName);
            
            var $viewAndChannelCount = $('<div>');
            
            var $textSpan1 = $('<span>');
            $textSpan1.text(obj.viewCount);
            $viewAndChannelCount.append($textSpan1);
            
            addSiteIndicator(obj, $viewAndChannelCount);
            
            var $textSpan2 = $('<span>');
            var channelWord;
            if (obj.channelCount === 1) {
                channelWord = "channel";
            }
            else {
                channelWord = "channels";
            }
            $textSpan2.text(obj.channelCount + " " + channelWord);
            $viewAndChannelCount.append($textSpan2);
            
            $viewAndChannelCount.attr('class', 'channel-name');
            $gameE.append($viewAndChannelCount);
            
            addMediaItemSorted(
                $gameE[0], obj, gameEs, gameObjs, container, compareFunc
            );
        });
    }
    
    
    function addVideos(pendingVideos) {
        
        var container = mediaContainerEs['videos'];
        var videoEs = mediaElementArrays['videos'];
        var videoObjs = mediaObjArrays['videos'];
        
        var compareFunc = getMediaCompareFunc('videos');
        
        if (videoEs.length === 0 && pendingVideos.length > 0) {
            $(container).find('span.empty-section-text').remove();
        }
        
        pendingVideos.forEach(function(obj) {
            
            var $videoE = $('<a>');
            $videoE.attr('href', obj.videoLink);
            $videoE.attr('title', obj.videoTitle);
            
            var $thumbnailCtnr = $('<div>');
            $thumbnailCtnr.addClass('thumbnail-ctnr video');
            $videoE.append($thumbnailCtnr);
            
            addMediaThumbnail(obj, $thumbnailCtnr);
            
            var $viewCount = $('<div>');
            $viewCount.text(obj.viewCount);
            $viewCount.attr('class', 'video-view-count');
            $thumbnailCtnr.append($viewCount);
            
            var $duration = $('<div>');
            $duration.text(obj.duration);
            $duration.attr('class', 'video-duration');
            $thumbnailCtnr.append($duration);
            
            var $title = $('<div>');
            $title.text(obj.videoTitle);
            $videoE.append($title);
            
            var $description = $('<div>');
            $description.text(obj.description);
            $description.attr('class', 'minor-text');
            $videoE.append($description);
            
            addGameDisplay(obj, $videoE, $thumbnailCtnr);
            
            var $channelNameAndDate = $('<div>');
            
            var $textSpan1 = $('<span>');
            $textSpan1.text(obj.channelName);
            $channelNameAndDate.append($textSpan1);
            
            addSiteIndicator(obj, $channelNameAndDate);
            
            var $textSpan2 = $('<span>');
            $textSpan2.text(obj.dateDisplay);
            $channelNameAndDate.append($textSpan2);
            
            $videoE.append($channelNameAndDate);
            
            addMediaItemSorted(
                $videoE[0], obj, videoEs, videoObjs, container, compareFunc
            );
            
            // We request the top <videoLimit> videos from each site, so we'll
            // generally be getting 2x or more videos than the limit. Prune
            // the video listing down to the limit.
            //
            // It may seem weird to discard media that we've already fetched,
            // but the goal is to give an *accurate* listing of the
            // top <videoLimit> videos given the sort criteria. The only way
            // to do that with multiple sites is to fetch some extra data.
            if (videoObjs.length > Settings.get('videoLimit')) {
                videoObjs.pop();
                var lastVideoE = videoEs.pop();
                $(lastVideoE).remove();
            }
        });
    }
    
    
    function startGettingMedia() {
        
        var numEnabledSites = 0;
        
        // For each site, we have to make one or more API calls via Ajax.
        // The function we call here will start the chain of API calls for
        // that site, to retrieve streams, videos, etc.
        SITE_NAMES.forEach(function(siteName){
            if (haveEnabledSite(siteName)) {
                SITE_NAMES_TO_MODULES[siteName].startGettingMedia();
                numEnabledSites++;
            }
        });
        
        if (numEnabledSites === 0) {
            showNotification(
                "No stream sites are enabled! Go to Settings to enable a site."
            );
        }
    }
    
    
    
    function init() {
        
        $(document.getElementById('footer')).hide();
        
        requestStatusE = document.getElementById('request-status');
        $(requestStatusE).hide();
        
        // Initialize help buttons.
        $('.help-button').each( function() {
            var buttonIdRegex = /^(.+)-button$/;
            var result = buttonIdRegex.exec(this.id);
            var helpTextId = result[1];
            
            // When this help button is clicked, open the corresponding
            // help text in a modal window.
            var clickCallback = function(helpTextId_, helpButtonE) {
                $('#'+helpTextId_).dialog({
                    modal: true,
                    width: 500,
                    position: {
                      my: "center bottom",
                      at: "right top",
                      of: helpButtonE
                    }
                });
            };
            $(this).click(
                Util.curry(clickCallback, helpTextId, this)
            );
        });
            
            
        if (Settings.hasStorage()) {
            Settings.storageToFields();
            
            // Order the sections.
            var $sectionsContainer = $('#sections');
            var sectionOrder = Settings.get('sectionOrder');
            var i;
            for (i = 0; i < sectionOrder.length; i++) {
                var sectionId = sectionOrder[i];
                var $section = $('#'+sectionId+'-section');
                // The sections are already in the desired parent element, but
                // we call append for each section to re-order them.
                $sectionsContainer.append($section);
            }
            
            // Add placeholder text for each media section.
            $('.media-container').each( function() {
                var spanE = document.createElement('span');
                spanE.textContent = "Waiting...";
                $(spanE).addClass('empty-section-text');
                this.appendChild(spanE);
            });
            
            if (Settings.get('twitchEnabled')) {
                var nowRedirecting = Twitch.setOAuth2Token();
                
                if (nowRedirecting) {
                    // Don't do anything else here, we're redirecting
                    // so we can get the token.
                    return;
                }
            }
    
            // Track which sites will provide what kinds of media types.
            mediaTypesToSites = {};
            var mediaTypesToSiteNames = {
                'streams': ['Twitch', 'Hitbox', 'Nico', 'Cavetube'],
                'hosts': ['Twitch'],
                'games': ['Twitch'],
                'videos': ['Twitch', 'Hitbox']
            };
            $.each(mediaTypesToSiteNames, function(mediaType, siteStrs){
                mediaTypesToSites[mediaType] = [];
                
                siteStrs.forEach( function(s){
                    if (haveEnabledSite(s)) {
                        mediaTypesToSites[mediaType].push(
                            SITE_NAMES_TO_MODULES[s]
                        );
                    }
                });
            });
            
            // Initialize container elements for streams, videos, etc.
            //
            // And show/hide media sections depending on which sites
            // are being used.
            mediaContainerEs = {};
            var containerIds = {
                'streams': 'streams',
                'hosts': 'hosts',
                'games': 'games',
                'videos': 'videos'
            };                             
            $.each(mediaTypesToSites, function(mediaType, sites) {
                mediaContainerEs[mediaType] = document.getElementById(
                    containerIds[mediaType]
                );
                var sectionE = document.getElementById(
                    containerIds[mediaType] + '-section'
                );
                    
                if (sites.length > 0) {
                    $(sectionE).show();
                }
                else {
                    $(sectionE).hide();
                }
            });
            
            // Initialize elements that track the media added so far.
            mediaElementArrays = {
                'streams': [],
                'hosts': [],
                'games': [],
                'videos': []
            };
            mediaObjArrays = {
                'streams': [],
                'hosts': [],
                'games': [],
                'videos': []
            };
            
            startGettingMedia();
        }
        else {
            // No settings stored yet. Initialize with defaults.
            Settings.fillFieldsWithDefaults();
            Settings.fieldsToStorage();
            // Prompt the user to set settings for the first time.
            Settings.show(Util.refreshPage, null);
        }
        
        
        // Initialize settings button.
        $('#settings-button').click(
            function() {
                Settings.show(Util.refreshPage, function(){});
            }
        );
    }
    
    
    
    // Public methods
    
    return {
        
        init: function() {
            init();
        },
        
        showNotification: function(notificationText) {
            showNotification(notificationText);
        },
        updateRequestStatus: function(site, numTotalRequests, numCompletedRequests) {
            updateRequestStatus(site, numTotalRequests, numCompletedRequests);
        },
        
        addStreams: function(streams) {
            addStreams(streams);
        },
        addHosts: function(hosts) {
            addHosts(hosts);
        },
        addGames: function(games) {
            addGames(games);
        },
        addVideos: function(videos) {
            addVideos(videos);
        }
    }
})();
