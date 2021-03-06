var Nico = (function() {
    
    // 2014-01-17 00:45:02
    var nicoDateRegex = /^(\d\d\d\d)-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)$/;
    
    var $coTableContainer = null;
    var $coEditArea = null;
    var $coEditButton = null;
    var $coConfirmArea = null;
    var $coConfirmButton = null;
    
    var coRegex = /^co[0-9]+$/;
    
    var errorIndicator = "There was an error previously";
    var maintenanceIndicator = "Nico is under maintenance";
    
    // Max number of streams we can get in a single API call.
    // For search.solr, http://www59.atwiki.jp/nicoapi/pages/48.html says
    // the max is 149, but it's actually 100.
    var MAX_STREAMS_IN_CALL = 100;
    // Max number of times we'll try a particular API call before giving up.
    var MAX_CALL_ATTEMPTS = 2;
    
    // Max number of API calls to have active in parallel. Too few and it may
    // take too long for everything to finish. Too many and some calls might
    // time out since they waited too long (since Nico seems to throttle
    // multiple calls to some extent).
    var MAX_ACTIVE_CALLS = 6;
    var numActiveCalls = 0;
    var callQueue = [];
    
    // Track unique server calls/requests (i.e. not counting retries). 
    var numTotalRequests = 0;
    var numCompletedRequests = 0;
    var numFailedRequests = 0;
    
    var followingCos = [];
    var addedStreamCos = [];
    
    
    
    function dateStrToObj(dateStr) {
        // From: API's date/time format, which is in Japan time
        // To: Javascript Date obj, in local timezone
        
        var results = nicoDateRegex.exec(dateStr);
        var year = results[1];
        var month = results[2] - 1;  // JS Dates start months from 0...
        var day = results[3];
        var hour = results[4];
        var minute = results[5];
        var second = results[6];
        
        var japanDate = new Date(year, month, day, hour, minute, second, 0);
        
        // getTimezoneOffset() returns the number of minutes that UTC
        // is ahead of your local time. Take that and add 9*60 to
        // get the minutes Japan (UTC+9 with no DST) is ahead of you.
        //
        // It doesn't matter what Date object you call getTimezoneOffset() from.
        var japanTimestamp = japanDate.getTime();
        var japanAheadAmount =
            (japanDate.getTimezoneOffset() + 9*60) * 60 * 1000;
        var localTimestamp = japanTimestamp - japanAheadAmount;
        var localDate = new Date(localTimestamp);
        
        return localDate;
    }
    
    
    
    function incTotalRequests() {
        numTotalRequests++;
        Main.updateRequestStatus("Nico", numTotalRequests, numCompletedRequests);
    }
    function incCompletedRequests() {
        numCompletedRequests++;
        Main.updateRequestStatus("Nico", numTotalRequests, numCompletedRequests);
    }
    
    function requestsAreDone() {
        return numTotalRequests === numCompletedRequests;
    }
    
    function reportFailedRequest() {
        numFailedRequests++;
        Main.showNotification(
            "Nicovideo requests failed after "
            + MAX_CALL_ATTEMPTS.toString()
            + " tries: "
            + numFailedRequests.toString() + " of "
            + numCompletedRequests.toString());
    }
    function reportMaintenance() {
        Main.showNotification(
            "Nicolive is currently under maintenance.");
    }
    
    
    
    function proxyAjax(
        url, params, callback, tracked, attemptNum, wasQueued) {
        /* tracked: boolean. If true, we'll track this request in the
        request status display, and we'll factor this request into logic
        that checks whether all the requests are done.
        
        attemptNum: Number of times we've attempted this particular
        server request. If the server response is a generic failure, then
        we'll make another attempt, until we hit the max number of attempts.
        
        wasQueued: boolean. If true, that means this request was previously
        queued because we had reached the max number of active requests. */
    
        if (tracked === undefined) {tracked = true;}
        if (attemptNum === undefined) {attemptNum = 1;}
        if (wasQueued === undefined) {wasQueued = false;}
        
        if (tracked && attemptNum === 1 && !wasQueued) {
            incTotalRequests();
        }
        
        if (numActiveCalls >= MAX_ACTIVE_CALLS) {
            callQueue.push(
                Util.curry(
                    proxyAjax, url, params, callback,
                    tracked, attemptNum, true
                )
            );
            return;
        }
        
        // Get the proxy request server from Config. If this is not set, then
        // default to Yahoo's YQL. (It's not the most reliable proxy,
        // but it's the only proxy known that's run by a big company, so
        // this app's load should be minimal for them.)
        var proxyRequestServer = Config.proxyRequestServer || 'yql';
        
        var successCallback = Util.curry(
            function(callback_, tracked_, response){
                numActiveCalls--;
                if (callQueue.length > 0) {
                    var waitingAjaxCall = callQueue.shift();
                    waitingAjaxCall();
                }
                
                callback_(response);
                if (tracked_) {incCompletedRequests();}
            },
            callback, tracked
        );
        var errorCallback = Util.curry(
            function(url_, params_, callback_, tracked_, attemptNum_, response){
                numActiveCalls--;
                
                // If any pending Ajax calls are waiting, dequeue a call. 
                if (callQueue.length > 0) {
                    var waitingAjaxCall = callQueue.shift();
                    waitingAjaxCall();
                }
                
                // Check the response (which jQuery wraps under the responseJSON
                // key) for Nico's maintenance status.
                //
                // Note that the response can be null, if YQL gave us null and
                // we're relaying the result here. So check for that before
                // checking the response fields.
                if (response !== null
                    && response.responseJSON.nicovideo_response
                    && response.responseJSON.nicovideo_response['@status']
                       === 'maintenance') {
                    // Nicolive is under maintenance.
                    if (tracked_) {
                        incCompletedRequests();
                        reportMaintenance();
                    }
                    else {
                        callback_(maintenanceIndicator);
                    }
                }
                else if (attemptNum_ >= MAX_CALL_ATTEMPTS) {
                    // Reached the max number of attempts for this call;
                    // giving up.
                    if (tracked_) {
                        incCompletedRequests();
                        reportFailedRequest();
                    }
                    else {
                        callback_(errorIndicator);
                    }
                }
                else {
                    // Trying again.
                    proxyAjax(url_, params_, callback_, tracked_, attemptNum_+1);
                }
            },
            url, params, callback, tracked, attemptNum
        );
        
        var proxyUrl;
        if (proxyRequestServer === 'yql') {
            // For Yahoo's YQL, the request must be built in a particular way,
            // and the response must be unwrapped as well.
            proxyUrl = 'https://query.yahooapis.com/v1/public/yql';
            
            var requestUrl = url + '?' + $.param(params);
            var query = 'select * from json where url="' + requestUrl + '"';
            params = {'q': query, 'format': 'json'};
            
            successCallback = Util.curry(
                function(succCallback, errCallback, response){
                    var results = response.query.results;
                    
                    if (results !== null) {
                        // YQL doesn't consider the maintenance case an error,
                        // so we check for the case explicitly again here.
                        //
                        // YQL is silly and changes the @status key to
                        // _status.
                        if (results.nicovideo_response
                            && results.nicovideo_response['_status']
                               === 'maintenance') {
                            // Tidy up the response as if it came from jQuery,
                            // then call the error callback.
                            var newResponse = {'responseJSON': results};
                            newResponse.responseJSON.nicovideo_response['@status'] =
                                results.nicovideo_response['_status'];
                            delete newResponse.responseJSON.nicovideo_response._status;
                            errCallback(newResponse);
                        }
                        else {
                            succCallback(results);
                        }
                    }
                    else {
                        // results should be null if YQL failed to get
                        // Nico's response.
                        errCallback(results);
                    }
                },
                successCallback, errorCallback
            );
        }
        else {
            // If the proxy server's not YQL, then it's assumed to work by
            // simply appending the request URL to a base URL (which should be
            // the proxyRequestServer value), and it's assumed to return the
            // request as-is instead of wrapping it (unlike YQL).
            //
            // For example, the following Node-run proxy has this behavior:
            // https://www.npmjs.com/package/cors-anywhere
            proxyUrl = proxyRequestServer + url;
        }
        
        var options = {
            type: 'POST',
            dataType: 'json',
            url: proxyUrl,
            data: params,
            success: successCallback,
            error: errorCallback
        };
        $.ajax(options);
        
        numActiveCalls++;
    }
    
    
    
    function queryStreamsAPI(keyword, from, callback) {
        var params = {
            '__format': 'json',
            'word': keyword,
            'from': from,
            'limit': MAX_STREAMS_IN_CALL.toString(),
            // Add a constantly-changing param to prevent caching
            // (Nico responses seem to be cached up to a day at times;
            // not sure if due to Nico or YQL).
            'timestamp': Date.now().toString()
        };
        
        // To call Nico's API without getting a Cross Origin error, use CORS
        // via proxy.
        proxyAjax(
            'http://api.ce.nicovideo.jp/liveapi/v1/video.search.solr',
            params,
            callback
        );
    }
    
    function startGettingAllLiveStreams() {
        
        var followingCommunities = Settings.get('nicoCommunities');
        // co<number> ids of following streams
        followingCos = followingCommunities.map(function(x){return x.co;});
        // Track which communities we've found as live streams already
        addedStreamCos = [];
        
        if (Settings.get('nicoCommunities').length === 0) {
            Main.showNotification(
                "You haven't specified any Nicovideo communities to watch for."
            );
            return;
        }
        
        var keywordsSetting = Settings.get('nicoSearchKeywords');
        var searchKeywords;
        if (keywordsSetting.indexOf(',') === -1) {
            // Only one keyword.
            searchKeywords = [keywordsSetting];
        }
        else {
            // Multiple keywords; make an array out of them.
            // Keyword separator is a comma followed by any number of spaces.
            searchKeywords = keywordsSetting.split(/,[ ]*/);
        }
        
        searchKeywords.forEach(function(keyword){
            // Make an API call to get the first 'page' of live streams under
            // this keyword.
            queryStreamsAPI(
                keyword, '0', Util.curry(continueGettingLiveStreams, keyword));
        });
    }
    
    function continueGettingLiveStreams(keyword, response) {
        
        var nlvResponse = response.nicolive_video_response;
        var totalCount = parseInt(nlvResponse.total_count.filtered);
        
        // So far we've made one call and obtained the total stream count.
        // Build the rest of the calls, using the total count to know when
        // to stop.
        //
        // (Note: currentIndex isn't the same as the number of streams
        // so far. For some reason the API may not give any streams at
        // indices 0 to 2.)
        var currentIndex = MAX_STREAMS_IN_CALL;
        while (currentIndex < totalCount) {
            queryStreamsAPI(
                keyword, currentIndex.toString(), setStreams);
            currentIndex += MAX_STREAMS_IN_CALL;
        }
        
        // Add the streams obtained from our first call.
        // (Should do this AFTER making other calls, otherwise the
        // calls completed will already match up with the calls expected,
        // and the Nico status will be marked as done.)
        setStreams(response);
    }
    
    function setStreams(response) {
        
        var streams = [];
        
        var nlvResponse = response.nicolive_video_response;
        
        // If count is 0 then there is no video_info key, so need to check
        // for that case.
        if (nlvResponse.count > 0) {
            nlvResponse.video_info.forEach(function(videoInfo){
                streams.push(videoInfo);
            });
        }
        
        
        var streamDicts = [];
        
        streams.forEach(function(vInfo){
            var globalId = vInfo.community.global_id;
            
            if (followingCos.indexOf(globalId) === -1) {
                // Not following this community, don't add to streamDicts
                return;
            }
            if (addedStreamCos.indexOf(globalId) !== -1) {
                // Already added this community, don't add to streamDicts
                return;
            }
            
            var d = {};
            
            d.channelLink = 'http://live.nicovideo.jp/watch/' + vInfo.video.id;
            if (vInfo.video._thumbnail_url !== undefined) {
                d.thumbnailUrl = vInfo.video._thumbnail_url;
            }
            else {
                d.thumbnailUrl = vInfo.community.thumbnail;
            }
            d.streamTitle = vInfo.video.title;
            d.gameName = "Not supported";
            d.viewCount = vInfo.video.view_counter;
            d.channelName = vInfo.community.name;
            d.startDate = dateStrToObj(vInfo.video.start_time);
            d.site = 'Nico';
            
            streamDicts.push(d);
            addedStreamCos.push(globalId);
        });
        
        Main.addStreams(streamDicts);
    }
    
    function getVideos() {
        
        // TODO: Implement for real
        setVideos();
    }
    
    function setVideos() {
        
        // TODO: Implement for real
        var videoDicts = [];
        
        Main.addVideos(videoDicts);
    }
    
    
    
    function startEditingCommunities() {
        var communities = Settings.get('nicoCommunities');
        var cos = communities.map(function(x){return x.co;});
        $('#textarea-nicoCommunities').text(cos.join('\n'));
    }
    
    function finishEditingCommunities() {
        var text = $('#textarea-nicoCommunities').val();
        if (text === "") {
            Settings.setInField('nicoCommunities', []);
            return;
        }
        
        var cos = Util.splitlines(text);
        var communities = [];
        cos.forEach(function(co){
            communities.push({'co': co});
        });
        Settings.setInField('nicoCommunities', communities);
    }
    
    function refreshCommunitiesTable() {
        // TODO: Handle the case where checking all communities requires
        // multiple calls
        // TODO: Store the checked community names, and check if the table
        // has been changed or not before doing the AJAX thing
        // TODO: Support re-checking in case the network call fails?
        
        var followingCommunities = Settings.get('nicoCommunities');
        
        $('#nico-community-count').text(followingCommunities.length.toString());
        $coTableContainer.empty();
        
        if (followingCommunities.length === 0) {
            // No communities specified
            $coTableContainer.text("(None)");
            return;
        }
        
        // Communities specified; make a table out of them
        var $coTable = $(document.createElement('table'));
        var $coTableBody = $(document.createElement('tbody'));
        $coTable.append($coTableBody);
        $coTableContainer.append($coTable);
        
        var noTypoCos = [];
        
        followingCommunities.forEach(function(community){
            var co = community.co;
            var $row = $(document.createElement('tr'));
            
            var $coCell = $(document.createElement('td'));
            $coCell.addClass('co');
            $coCell.text(co);
            $row.append($coCell);
            
            var $nameCell = $(document.createElement('td'));
            $nameCell.addClass('coName');
            if (coRegex.exec(co) !== null) {
                $nameCell.text("Checking...");
                noTypoCos.push(co);
            }
            else {
                $nameCell.text("Typo?");
            }
            $row.append($nameCell);
            
            $coTableBody.append($row);
        });
        
        // Get the community names from the server.
        var params = {
            '__format': 'json',
            'id': noTypoCos.join(',')
        };
        proxyAjax(
            'http://api.ce.nicovideo.jp/api/v1/community.array',
            params,
            refreshCommunityLinks,
            false
        );
    }
    
    function refreshCommunityLinks(response) {
        
        var $rows = $coTableContainer.find('tr');
        
        if (response === errorIndicator || response === maintenanceIndicator) {
            var cellText;
            if (response === errorIndicator) {
                cellText = "Checking failed";
            }
            else if (response === maintenanceIndicator) {
                cellText = "Nico is under maintenance";
            }
            
            $rows.each(function(i, row) {
                var $nameCell = $(row).children('td.coName');
                
                if ($nameCell.text() === "Checking...") {
                    $nameCell.text(cellText);
                }
            });
            return;
        }
        
        var coToName = {};
        var count = parseInt(response.nicovideo_community_response.count);
        
        if (count > 1) {
            var communities = response.nicovideo_community_response.community;
            communities.forEach(function(community){
                coToName[community.global_id] = community.name;
            });
        }
        else if (count === 1) {
            var community = response.nicovideo_community_response.community;
            coToName[community.global_id] = community.name;
        }
        // Else, count is 0, and there's no entries to add
        
        $rows.each(function(i, row) {
            var $row = $(row);
            var $nameCell = $row.children('td.coName');
            
            if ($nameCell.text() !== "Checking...") {return;}
            
            $nameCell.empty();
            
            var co = $row.children('td.co').text();
            
            if (coToName.hasOwnProperty(co)) {
                var $anchor = $(document.createElement('a'));
                $anchor.attr('href', 'http://com.nicovideo.jp/community/'+co);
                $anchor.attr('target', '_blank');
                $anchor.text(coToName[co]);
                
                $nameCell.append($anchor);
            }
            else {
                $nameCell.text("Not found");
            }
        });
    }
    
    function initSettings() {
        $coTableContainer = $('#nicoCommunities-table-container');
        $coEditArea = $('#edit-nicoCommunities');
        $coEditButton = $('#edit-button-nicoCommunities');
        $coConfirmArea = $('#confirm-nicoCommunities');
        $coConfirmButton = $('#confirm-button-nicoCommunities');
        
        $coEditButton.click(function(e) {
            startEditingCommunities();
            $coEditArea.show();
            $coConfirmArea.hide();
        });
        $coConfirmButton.click(function(e) {
            finishEditingCommunities();
            refreshCommunitiesTable();
            $coConfirmArea.show();
            $coEditArea.hide();
        });
        
        refreshCommunitiesTable();
    }
    
    
    
    // Public methods
    
    return {
        
        startGettingMedia: function() {
            startGettingAllLiveStreams();
            getVideos();
        },
        requestsAreDone: function() {
            return requestsAreDone();
        },
        
        refreshCommunitiesTable: function() {
            refreshCommunitiesTable();
        },
        initSettings: function() {
            initSettings();
        }
    }
})();
