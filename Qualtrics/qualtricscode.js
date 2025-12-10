Qualtrics.SurveyEngine.addOnload(function() {
    var questionId = this.questionId;
    var mediaRecorder;
    var audioChunks = [];
    var stream;
    
    // ⭐ CHANGE THIS to your Cloud Run URL!
    var uploadServerUrl = 'URL';
    
    // ⭐ CHANGE THIS to your target word (or pull from embedded data)
    // Example: var targetWord = "${e://Field/TargetWord}";
    var targetWord = "Heisenberg";  // The actual word for scoring
    
    var questionContainer = document.getElementById("question-" + questionId);
    if (!questionContainer) {
        questionContainer = document.querySelector('.question');
    }
    
    if (!questionContainer) {
        console.error("Could not find question container");
        return;
    }
    
    // Create recording controls
    var controlsDiv = document.createElement('div');
    controlsDiv.style.cssText = 'margin: 20px 0; padding: 20px; background: #f5f5f5; border-radius: 5px;';
    
    // Initial display message (will be updated after recording)
    var targetWordDisplay = document.createElement('div');
    targetWordDisplay.innerHTML = '<strong>I think you said:</strong> <em>You haven\'t said anything yet</em>';
    targetWordDisplay.style.cssText = 'margin: 10px 0; padding: 10px; background: #e3f2fd; border-left: 4px solid #2196F3; font-size: 18px;';
    
    var recordButton = document.createElement('button');
    recordButton.innerHTML = '🎤 Start Recording';
    recordButton.type = 'button';
    recordButton.style.cssText = 'padding: 10px 20px; font-size: 16px; margin: 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;';
    
    var stopButton = document.createElement('button');
    stopButton.innerHTML = '⏹️ Stop Recording';
    stopButton.type = 'button';
    stopButton.disabled = true;
    stopButton.style.cssText = 'padding: 10px 20px; font-size: 16px; margin: 10px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; opacity: 0.5;';
    
    var status = document.createElement('div');
    status.innerHTML = 'Ready to record';
    status.style.cssText = 'margin: 10px; font-weight: bold;';
    
    var resultsDiv = document.createElement('div');
    resultsDiv.style.cssText = 'margin: 15px 0; padding: 15px; background: white; border-radius: 4px; display: none;';
    
    controlsDiv.appendChild(targetWordDisplay);
    controlsDiv.appendChild(recordButton);
    controlsDiv.appendChild(stopButton);
    controlsDiv.appendChild(status);
    controlsDiv.appendChild(resultsDiv);
    questionContainer.appendChild(controlsDiv);
    
    // Start recording
    recordButton.onclick = function() {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function(mediaStream) {
                stream = mediaStream;
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                
                mediaRecorder.ondataavailable = function(event) {
                    audioChunks.push(event.data);
                };
                
                mediaRecorder.onstop = function() {
                    var audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    var fileSizeKB = (audioBlob.size / 1024).toFixed(2);
                    
                    status.innerHTML = 'Uploading and transcribing... (' + fileSizeKB + ' KB)';
                    status.style.color = 'orange';
                    
                    var formData = new FormData();
                    formData.append('audio', audioBlob, questionId + '.webm');
                    formData.append('questionId', questionId);
                    formData.append('targetWord', targetWord);  // Sends the actual target word
                    
                    fetch(uploadServerUrl, {
                        method: 'POST',
                        body: formData
                    })
                    .then(function(response) {
                        if (!response.ok) {
                            throw new Error('Server returned ' + response.status);
                        }
                        return response.json();
                    })
                    .then(function(data) {
                        if (data.success) {
                            // Store all data in Qualtrics embedded data
                            Qualtrics.SurveyEngine.setJSEmbeddedData(
                                questionId + "_AudioURL",
                                data.url
                            );
                            
                            Qualtrics.SurveyEngine.setJSEmbeddedData(
                                questionId + "_Transcript",
                                data.transcript
                            );
                            
                            Qualtrics.SurveyEngine.setJSEmbeddedData(
                                questionId + "_ProximityScore",
                                data.proximity_score
                            );
                            
                            Qualtrics.SurveyEngine.setJSEmbeddedData(
                                questionId + "_ExactMatch",
                                data.exact_match ? "1" : "0"
                            );
                            
                            Qualtrics.SurveyEngine.setJSEmbeddedData(
                                questionId + "_TranscriptionConfidence",
                                data.transcription_confidence
                            );
                            
                            // Update display with what they actually said
                            targetWordDisplay.innerHTML = '<strong>I think you said:</strong> "' + data.transcript + '"';
                            
                            // Display results
                            var scoreColor = data.proximity_score >= 80 ? 'green' : 
                                           data.proximity_score >= 50 ? 'orange' : 'red';
                            
                            var matchBadge = data.exact_match ? 
                                '<span style="background: #4CAF50; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-left: 10px;">✓ EXACT MATCH</span>' : '';
                            
                            resultsDiv.innerHTML = 
                                '<div style="margin-bottom: 10px;"><strong>Full Transcript:</strong> "' + data.transcript + '"</div>' +
                                '<div style="margin-bottom: 10px;"><strong>Proximity Score:</strong> <span style="color: ' + scoreColor + '; font-size: 24px; font-weight: bold;">' + data.proximity_score + '%</span>' + matchBadge + '</div>' +
                                '<div style="font-size: 12px; color: #666;">Transcription confidence: ' + data.transcription_confidence + '%</div>';
                            
                            resultsDiv.style.display = 'block';
                            
                            status.innerHTML = '✓ Recording processed successfully!';
                            status.style.color = 'green';
                            
                            console.log('Processing complete:', data);
                        } else {
                            throw new Error(data.error || 'Upload failed');
                        }
                    })
                    .catch(function(error) {
                        status.innerHTML = '❌ Upload failed: ' + error.message;
                        status.style.color = 'red';
                        console.error('Upload error:', error);
                    });
                };
                
                mediaRecorder.start();
                recordButton.disabled = true;
                recordButton.style.opacity = '0.5';
                stopButton.disabled = false;
                stopButton.style.opacity = '1';
                status.innerHTML = '🔴 Recording in progress...';
                status.style.color = 'red';
            })
            .catch(function(err) {
                status.innerHTML = '❌ Microphone access denied: ' + err.message;
                status.style.color = 'red';
                console.error('Microphone error:', err);
            });
    };
    
    // Stop recording
    stopButton.onclick = function() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            stream.getTracks().forEach(track => track.stop());
            recordButton.disabled = false;
            recordButton.style.opacity = '1';
            stopButton.disabled = true;
            stopButton.style.opacity = '0.5';
            status.innerHTML = 'Processing...';
        }
    };
});
