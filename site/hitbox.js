var Hitbox = (function() {
    
    // 2014-01-17 00:45:02
    var hitboxDateRegex = /^(\d\d\d\d)-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)$/;
    
    var hitboxStreamDicts = null;
    var hitboxVideoDicts = null;
    
    
    function hitboxDateStrToObj(dateStr) {
        // From: API's date/time format, which is in UTC
        // To: Javascript Date obj, in local timezone
        
        var results = hitboxDateRegex.exec(dateStr);
        var year = results[1];
        var month = results[2] - 1;  // JS Dates start months from 0...
        var day = results[3];
        var hour = results[4];
        var minute = results[5];
        var second = results[6];
        
        var utcDate = new Date(year, month, day, hour, minute, second, 0);
        
        // getTimezoneOffset() returns the number of minutes that UTC
        // is ahead of your local time. So subtract that amount to go
        // from UTC to local.
        //
        // It doesn't matter what Date object you call getTimezoneOffset() from.
        var utcTimestamp = utcDate.getTime();
        var localTimestamp = utcTimestamp - (utcDate.getTimezoneOffset() * 60 * 1000);
        var localDate = new Date(localTimestamp);
        
        return localDate;
    }
    
    
    
    function getHitboxUserId() {
            
        // Since the Hitbox API doesn't use OAuth, we just specify
        // the Hitbox username manually in the settings.
        var username = Main.getSettingFromForm('hitboxUsername');
        
        if (username === '') {
            showNotification("No Hitbox username specified in the settings.");
            hitboxStreamDicts = [];
            hitboxVideoDicts = [];
            Main.callback();
            return;
        }
        
        // Make an API call to get this Hitbox user's info.
        var url = 'https://www.hitbox.tv/api/media/live/' + username;
        
        // Use $.ajax() instead of $.getJSON() so that we can define a
        // callback to handle errors, including:
        // - The username doesn't exist
        // - The user hasn't set their stream title and game
        $.ajax({
            url: url,
            type: 'GET',
            dataType: 'json',
            success: getHitboxStreamsAndVideos,
            error: function() {
                showNotification(
                    "Couldn't get your Hitbox following listing. Two possible causes: "
                    + "(A) You need to set your Hitbox stream title and game, even if "
                    + "you don't plan to stream. Otherwise I can't find your user info, "
                    + "due to a quirk in how Hitbox accounts work. "
                    + "(B) The username you specified doesn't exist on Hitbox."
                );
                hitboxStreamDicts = [];
                hitboxVideoDicts = [];
                Main.callback();
            }
        });
    }
    function getHitboxStreamsAndVideos(liveInfo) {
        
        var userId = liveInfo.livestream[0].media_user_id;
        
        
        // Make an API call to get the live streams that this user
        // is following.
        var url = 'https://www.hitbox.tv/api/media/live/list?'
            + 'follower_id=' + userId
            + '&limit=' + Main.getSettingFromForm('streamLimit');
        
        // Use $.ajax() instead of $.getJSON() so that we can define a
        // callback to handle errors, including:
        // - no streams being live (that returns an error for some reason)
        $.ajax({
            url: url,
            type: 'GET',
            dataType: 'json',
            success: collectHitboxStreams,
            error: function() {hitboxStreamDicts = []; Main.callback();}
        });
        
        
        // Make an API call to get the latest videos of the channels that
        // this user is following.
        // (Note: These are the parts of recordings that the user has chosen
        // to save. Basically like Twitch highlights.)
        var url = 'https://www.hitbox.tv/api/media/video/list?'
            + 'filter=recent&follower_id=' + userId
            + '&limit=' + Main.getSettingFromForm('videoLimit');
        
        // Use $.ajax() instead of $.getJSON() so that we can define a
        // callback to handle errors, including:
        // - no videos from channels you follow
        $.ajax({
            url: url,
            type: 'GET',
            dataType: 'json',
            success: collectHitboxVideos,
            error: function() {hitboxVideoDicts = []; Main.callback();}
        });
    }
    function collectHitboxStreams(liveList) {
        
        var livestreams = liveList.livestream;
        hitboxStreamDicts = [];
        
        var i;
        for (i = 0; i < livestreams.length; i++) {
            var stream = livestreams[i];
            var streamDict = {};
            
            streamDict.channelLink = stream.channel.channel_link;
            streamDict.thumbnailUrl = 'http://edge.'
                + Main.getSettingFromForm('hitboxThumbnailServer')
                + '.hitbox.tv' + stream.media_thumbnail;
            streamDict.title = stream.media_status;
            
            if (stream.category_name) {
                streamDict.gameName = stream.category_name;
                streamDict.gameLink = 'http://www.hitbox.tv/game/' + stream.category_seo_key;
                streamDict.gameImage = 'http://edge.'
                    + Main.getSettingFromForm('hitboxThumbnailServer')
                    + '.hitbox.tv' + stream.category_logo_large;
            }
            else {
                streamDict.gameName = null;
            }
            
            streamDict.viewCount = stream.media_views;
            streamDict.channelName = stream.media_user_name;
            streamDict.site = 'Hitbox';
            
            hitboxStreamDicts.push(streamDict);
        }
        
        Main.callback();
    }
    function collectHitboxVideos(videoList) {
        
        var videos = videoList.video;
        hitboxVideoDicts = [];
        
        var i;
        for (i = 0; i < videos.length; i++) {
            var video = videos[i];
            var videoDict = {};
            
            videoDict.videoLink = 'http://www.hitbox.tv/video/' + video.media_id;
            videoDict.thumbnailUrl = 'http://edge.'
                + Main.getSettingFromForm('hitboxThumbnailServer')
                + '.hitbox.tv' + video.media_thumbnail;
            videoDict.videoTitle = video.media_status;
            videoDict.description = video.media_description || "No description";
            
            if (video.category_name) {
                videoDict.gameName = video.category_name;
                videoDict.gameLink = 'http://www.hitbox.tv/game/' + video.category_seo_key;
                videoDict.gameImage = 'http://edge.'
                    + Main.getSettingFromForm('hitboxThumbnailServer')
                    + '.hitbox.tv' + video.category_logo_large;
            }
            else {
                videoDict.gameName = null;
            }
            
            videoDict.viewCount = video.media_views;
            videoDict.channelName = video.media_user_name;
            videoDict.duration = Main.timeSecToHMS(video.media_duration);
            videoDict.site = 'Hitbox';
            
            var dateObj = hitboxDateStrToObj(video.media_date_added);
            videoDict.unixTimestamp = dateObj.getTime();
            
            // Can also use video.media_time_ago to get this directly as a
            // string, but Twitch doesn't have an equivalent field...
            //
            // So, we might as well use this same non-API function to calculate
            // time ago for both Twitch and Hitbox. It keeps things consistent.
            videoDict.dateDisplay = Main.dateObjToTimeAgo(dateObj);
            
            hitboxVideoDicts.push(videoDict);
        }
        
        Main.callback();
    }
    
    
    
    // Public methods
    
    return {
        
        firstAPICall: function() {
            getHitboxUserId();
        },
        getStreamDicts: function() {
            return hitboxStreamDicts;
        },
        getVideoDicts: function() {
            return hitboxVideoDicts;
        }
    }
})();