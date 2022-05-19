const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const cors = require("cors");
const jwt = require('jsonwebtoken');
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cjnjs.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next){
  const authHeader = req.headers.authorization;
  if(!authHeader){
    return res.status(401).send({message: 'UnAuthorized Access'})
  }
  const token = authHeader.split(' ')[1];   // .split() return a array.
  // verify a token symmetric
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded) {
    if(err){
      return res.status(403).send({message: 'Forbidden Access'});
    }
    // console.log(decoded) 
    req.decoded = decoded;
    next();
  });
}

async function run(){
    try{
        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');
        const doctorCollection = client.db('doctors_portal').collection('doctors');


        const verifyAdmin = async( req, res, next) => {
          const requester = req.decoded.email;
          const requesterAccount = await userCollection.findOne({email: requester});
          if(requesterAccount.role === 'admin'){

          }
          else{
            res.status(403).send({message: 'Forbidden Request'});
          }
          next();
        }

        app.get('/user', verifyJWT, async (req, res) => {
          const users = await userCollection.find().toArray();
          res.send(users);
        });

            // check user (Admin or not)
        app.get('/admin/:email', async (req, res) => {
          const email = req.params.email;
          const user = await userCollection.findOne({email: email});
          const isAdmin = user?.role === 'admin';
          res.send({admin: isAdmin});
        })


            //  do admin in Dashboard Route (All User) page
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
          const email = req.params.email;
          // const requester = req.decoded.email;
          // const requesterAccount = await userCollection.findOne({email: requester});
          // if(requesterAccount.role === 'admin'){
            const filter = {email: email};
            const updateDoc = {
              $set: {role: 'admin'},
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
          // }
          // else{
          //   res.status(403).send({message: 'Forbidden Request'});
          // }
        });


            // find and update user data in database (when user login or Register)
        app.put('/user/:email', async (req, res) => {
          const email = req.params.email;
          const user = req.body;
          const filter = {email: email};
          const option = {upsert: true};
          const updateDoc = {
            $set: user,
          };
          const result = await userCollection.updateOne(filter, updateDoc, option);
          const token = jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1d'})
          res.send({result, token});
        });


        app.get('/service', async(req, res)=>{
            const query = {};
            const cursor = serviceCollection.find(query).project({name: 1});
            const services = await cursor.toArray();
            res.send(services);
        });



        // Warning: 
        // This is not the proper way to query. 
        // After learning more about mongodb. ues aggregate lookup, pipeline, match, group
        app.get('/available', async (req, res) => {
          const date = req.query.date;
          // step 1: get all services
          const services = await serviceCollection.find().toArray();
          // step 2: get the booking of that day. output: [{}, {}, {}, {}, {}]
          const query = {date: date};
          const bookings = await bookingCollection.find(query).toArray();
          // step 3: for each service, find bookings for that service
          services.forEach(service => {
            // step 4: find bookings for that service. output: [{}, {}, {}]
            const serviceBooking = bookings.filter(book => book.treatment === service.name);
            // step 5: select slots for the serviceBooking: ['', '', '', '']
            const bookedSlot = serviceBooking.map(book => book.slot);
            // step 6: select those slots that are not in bookedSlots
            const available = service.slots.filter(slot => !bookedSlot.includes(slot));
            // step 7: available to slots to make it easier
            service.slots = available;
          });
          res.send(services);

        })

        /**
         * API Naming Convention
         * app.get('booking')  // get all bookings in this collection. or get more than one or by filter
         * app.get('booking/:id')  // get a specific booking
         * app.post('booking')  // add a new booking
         * app.patch('booking/:id')  // update
         * app.put('booking/:id')  // upsert ==> update(if exist) or insert(if doesn't exist)
         * app.delete('booking/:id')
         */


            // get email based bookings for myAppointment client route
        app.get('/booking', verifyJWT, async(req, res) => {
          const patient = req.query.patient;
          const authorization = req.headers.authorization;
          // console.log(authorization);
          const decodedEmail = req.decoded.email;
          if(patient === decodedEmail){
            const query = {patient: patient};
            const bookings = await bookingCollection.find(query).toArray();
            return res.send(bookings);
          }else{
            return res.status(403).send({message: 'Forbidden access'})
          }
        });

        app.post('/booking', async (req, res) => {
          const booking = req.body;
          const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient};
          const exists = await bookingCollection.findOne(query);
          if(exists){
            return res.send({success: false, booking: exists});
          }
          const result = await bookingCollection.insertOne(booking);
          return res.send({success: true, result});
        });


        app.get('/doctor', verifyJWT, verifyAdmin, async(req, res) => {
          const doctors = await doctorCollection.find().toArray();
          res.send(doctors);
        });

            // Add a Doctor in database
        app.post('/doctor', verifyJWT, verifyAdmin, async(req, res) => {
          const doctor = req.body;
          const result = await doctorCollection.insertOne(doctor);
          res.send(result);
        });

        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async(req, res) => {
          const email = req.params.email;
          const filter = {email: email};
          console.log(filter);
          const result = await doctorCollection.deleteOne(filter);
          res.send(result);
        });

    }
    finally{

    }
}

run().catch(console.dir);






app.get("/", (req, res) => {
  res.send("Hello from Doctors Portal!");
});

app.listen(port, () => {
  console.log(`Doctors Portal app listening on port ${port}`);
});
