const express = require('express');
const { program } = require('commander');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const app = express();

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Parse command-line arguments
program
    .requiredOption('-h, --host <host>', 'Server host address')
    .requiredOption('-p, --port <port>', 'Server port number', parseInt)
    .requiredOption('-c, --cache <path>', 'Cache directory path')
    .parse(process.argv);

const options = program.opts();
const cacheDir = path.resolve(options.cache);

// Ensure cache directory exists
async function ensureCacheDir() {
    try {
        await fs.mkdir(cacheDir, { recursive: true });
    } catch (err) {
        console.error('Error creating cache directory:', err);
        process.exit(1);
    }
}

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Load Swagger documentation
const swaggerDocument = YAML.load('./swagger.yaml');
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

/**
 * @swagger
 * /notes:
 *   get:
 *     summary: Retrieve a list of all notes
 *     responses:
 *       200:
 *         description: A JSON array of notes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   text:
 *                     type: string
 */
app.get('/notes', async (req, res) => {
    try {
        const files = await fs.readdir(cacheDir);
        const notes = await Promise.all(
            files.map(async (file) => {
                const content = await fs.readFile(path.join(cacheDir, file), 'utf8');
                return { name: file, text: content };
            })
        );
        res.status(200).json(notes);
    } catch (err) {
        res.status(500).send('Server error');
    }
});

/**
 * @swagger
 * /notes/{name}:
 *   get:
 *     summary: Retrieve a specific note by name
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The note content
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       404:
 *         description: Note not found
 */
app.get('/notes/:name', async (req, res) => {
    const filePath = path.join(cacheDir, req.params.name);
    try {
        const content = await fs.readFile(filePath, 'utf8');
        res.status(200).send(content);
    } catch (err) {
        res.status(404).send('Note not found');
    }
});

/**
 * @swagger
 * /notes/{name}:
 *   put:
 *     summary: Update a specific note
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         text/plain:
 *           schema:
 *             type: string
 *     responses:
 *       200:
 *         description: Note updated
 *       404:
 *         description: Note not found
 */
app.put('/notes/:name', async (req, res) => {
    const filePath = path.join(cacheDir, req.params.name);
    try {
        await fs.access(filePath);
        await fs.writeFile(filePath, req.body);
        res.status(200).send('Note updated');
    } catch (err) {
        res.status(404).send('Note not found');
    }
});

/**
 * @swagger
 * /notes/{name}:
 *   delete:
 *     summary: Delete a specific note
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Note deleted
 *       404:
 *         description: Note not found
 */
app.delete('/notes/:name', async (req, res) => {
    const filePath = path.join(cacheDir, req.params.name);
    try {
        await fs.unlink(filePath);
        res.status(200).send('Note deleted');
    } catch (err) {
        res.status(404).send('Note not found');
    }
});

/**
 * @swagger
 * /write:
 *   post:
 *     summary: Create a new note
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               note_name:
 *                 type: string
 *               note:
 *                 type: string
 *     responses:
 *       201:
 *         description: Note created
 *       400:
 *         description: Note already exists
 */
app.post('/write', upload.none(), async (req, res) => {
    const { note_name, note } = req.body;
    if (!note_name || !note) {
        return res.status(400).send('Missing note_name or note');
    }
    const filePath = path.join(cacheDir, note_name);
    try {
        await fs.access(filePath);
        res.status(400).send('Note already exists');
    } catch (err) {
        await fs.writeFile(filePath, note);
        res.status(201).send('Note created');
    }
});

/**
 * @swagger
 * /UploadForm.html:
 *   get:
 *     summary: Retrieve the note upload form
 *     responses:
 *       200:
 *         description: HTML form for uploading notes
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
app.get('/UploadForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'UploadForm.html'));
});

// Start the server
async function startServer() {
    await ensureCacheDir();
    app.listen(options.port, options.host, () => {
        console.log(`Server running at http://${options.host}:${options.port}`);
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});