/* DON'T LOSE YOUR SELF
Author: Abby Wang
Date: February 24, 2026
Description: HTML text, source code, and what not for integration with handsfreejs. Not used but good reference

Source: https://handsfreejs.netlify.app/ref/model/facemesh.html#with-defaults */

const handsfree = new Handsfree({
  facemesh: {
    enabled: true,
    // The maximum number of faces to detect [1 - 4]
    maxNumFaces: 1,

    // Minimum confidence [0 - 1] for a face to be considered detected
    minDetectionConfidence: 0.5,
    
    // Minimum confidence [0 - 1] for the landmark tracker to be considered detected
    // Higher values are more robust at the expense of higher latency
    minTrackingConfidence: 0.5
  }
})

handsfree.start()

// faceIndex [0 - 3] An array of landmark points for each detected face
handsfree.data.facemesh.multiFaceLandmarks[faceIndex] == [
  // Landmark 0
  {x, y},
  // Landmark 1
  {x, y},
  // ...
  // Landmark 467
  {x, y}
]

// face 0, landmark 0
handsfree.data.facemesh.multiFaceLandmarks[0][0].x
handsfree.data.facemesh.multiFaceLandmarks[0][0].y

