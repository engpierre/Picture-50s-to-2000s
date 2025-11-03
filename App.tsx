/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, ChangeEvent, useEffect } from 'react';
import { motion, Reorder } from 'framer-motion';
import { generateDecadeImage } from './services/geminiService';
import PolaroidCard from './components/PolaroidCard';
import { createAlbumPage, dataUrlToFile } from './lib/albumUtils';
import Footer from './components/Footer';

const DECADES = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s'];

// Pre-defined positions for a scattered look on desktop
const POSITIONS = [
    { top: '5%', left: '10%', rotate: -8 },
    { top: '15%', left: '60%', rotate: 5 },
    { top: '45%', left: '5%', rotate: 3 },
    { top: '2%', left: '35%', rotate: 10 },
    { top: '40%', left: '70%', rotate: -12 },
    { top: '50%', left: '38%', rotate: -3 },
];

const GHOST_POLAROIDS_CONFIG = [
  { initial: { x: "-150%", y: "-100%", rotate: -30 }, transition: { delay: 0.2 } },
  { initial: { x: "150%", y: "-80%", rotate: 25 }, transition: { delay: 0.4 } },
  { initial: { x: "-120%", y: "120%", rotate: 45 }, transition: { delay: 0.6 } },
  { initial: { x: "180%", y: "90%", rotate: -20 }, transition: { delay: 0.8 } },
  { initial: { x: "0%", y: "-200%", rotate: 0 }, transition: { delay: 0.5 } },
  { initial: { x: "100%", y: "150%", rotate: 10 }, transition: { delay: 0.3 } },
];


type ImageStatus = 'pending' | 'done' | 'error';
interface GeneratedImage {
    status: ImageStatus;
    url?: string;
    error?: string;
}

const primaryButtonClasses = "font-permanent-marker text-xl text-center text-black bg-yellow-400 py-3 px-8 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:-rotate-2 hover:bg-yellow-300 shadow-[2px_2px_0px_2px_rgba(0,0,0,0.2)]";
const secondaryButtonClasses = "font-permanent-marker text-xl text-center text-white bg-white/10 backdrop-blur-sm border-2 border-white/80 py-3 px-8 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:rotate-2 hover:bg-white hover:text-black";

const useMediaQuery = (query: string) => {
    const [matches, setMatches] = useState(false);
    useEffect(() => {
        const media = window.matchMedia(query);
        if (media.matches !== matches) {
            setMatches(media.matches);
        }
        const listener = () => setMatches(media.matches);
        window.addEventListener('resize', listener);
        return () => window.removeEventListener('resize', listener);
    }, [matches, query]);
    return matches;
};

function App() {
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [generatedImages, setGeneratedImages] = useState<Record<string, GeneratedImage>>({});
    const [customCaptions, setCustomCaptions] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isDownloading, setIsDownloading] = useState<boolean>(false);
    const [appState, setAppState] = useState<'idle' | 'image-uploaded' | 'generating' | 'results-shown'>('idle');
    const [orderedDecades, setOrderedDecades] = useState(DECADES);
    const [canShare, setCanShare] = useState(false);
    const isMobile = useMediaQuery('(max-width: 768px)');

    useEffect(() => {
        // The Web Share API is available on the navigator object.
        // We also check if `canShare` is available, which checks if files can be shared.
        if (navigator.share && navigator.canShare) {
            setCanShare(true);
        }
    }, []);

    const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setUploadedImage(reader.result as string);
                setAppState('image-uploaded');
                setGeneratedImages({}); // Clear previous results
            };
            reader.readAsDataURL(file);
        }
    };

    const handleGenerateClick = async () => {
        if (!uploadedImage) return;

        setIsLoading(true);
        setAppState('generating');
        
        const initialImages: Record<string, GeneratedImage> = {};
        DECADES.forEach(decade => {
            initialImages[decade] = { status: 'pending' };
        });
        setGeneratedImages(initialImages);

        const concurrencyLimit = 2; // Process two decades at a time
        const decadesQueue = [...DECADES];

        const processDecade = async (decade: string) => {
            try {
                const prompt = `Reimagine the person in this photo in the style of the ${decade}. This includes clothing, hairstyle, photo quality, and the overall aesthetic of that decade. The output must be a photorealistic image showing the person clearly.`;
                const resultUrl = await generateDecadeImage(uploadedImage, prompt);
                setGeneratedImages(prev => ({
                    ...prev,
                    [decade]: { status: 'done', url: resultUrl },
                }));
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
                setGeneratedImages(prev => ({
                    ...prev,
                    [decade]: { status: 'error', error: errorMessage },
                }));
                console.error(`Failed to generate image for ${decade}:`, err);
            }
        };

        const workers = Array(concurrencyLimit).fill(null).map(async () => {
            while (decadesQueue.length > 0) {
                const decade = decadesQueue.shift();
                if (decade) {
                    await processDecade(decade);
                }
            }
        });

        await Promise.all(workers);

        setIsLoading(false);
        setAppState('results-shown');
    };

    const handleRegenerateDecade = async (decade: string) => {
        if (!uploadedImage) return;

        // Prevent re-triggering if a generation is already in progress
        if (generatedImages[decade]?.status === 'pending') {
            return;
        }
        
        console.log(`Regenerating image for ${decade}...`);

        // Set the specific decade to 'pending' to show the loading spinner
        setGeneratedImages(prev => ({
            ...prev,
            [decade]: { status: 'pending' },
        }));

        // Call the generation service for the specific decade
        try {
            const prompt = `Reimagine the person in this photo in the style of the ${decade}. This includes clothing, hairstyle, photo quality, and the overall aesthetic of that decade. The output must be a photorealistic image showing the person clearly.`;
            const resultUrl = await generateDecadeImage(uploadedImage, prompt);
            setGeneratedImages(prev => ({
                ...prev,
                [decade]: { status: 'done', url: resultUrl },
            }));
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setGeneratedImages(prev => ({
                ...prev,
                [decade]: { status: 'error', error: errorMessage },
            }));
            console.error(`Failed to regenerate image for ${decade}:`, err);
        }
    };

    const handleCaptionChange = (decade: string, newCaption: string) => {
        setCustomCaptions(prev => ({
            ...prev,
            [decade]: newCaption,
        }));
    };
    
    const handleReset = () => {
        setUploadedImage(null);
        setGeneratedImages({});
        setCustomCaptions({});
        setAppState('idle');
        setOrderedDecades(DECADES); // Reset order
    };

    const handleDownloadIndividualImage = (decade: string) => {
        const image = generatedImages[decade];
        if (image?.status === 'done' && image.url) {
            const link = document.createElement('a');
            link.href = image.url;
            link.download = `past-forward-${decade}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

     const handleShareIndividualImage = async (decade: string) => {
        const image = generatedImages[decade];
        if (image?.status === 'done' && image.url && navigator.share) {
            try {
                const file = await dataUrlToFile(image.url, `past-forward-${decade}.jpg`);
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: `My ${decade} Look!`,
                        text: `Check out my look from the ${decade}, generated by Past Forward!`,
                    });
                } else {
                    console.error("This file can't be shared by the browser.");
                }
            } catch (error) {
                // Ignore AbortError which occurs when the user cancels the share dialog
                if ((error as DOMException).name !== 'AbortError') {
                    console.error("Error sharing image:", error);
                }
            }
        }
    };

    const prepareAlbumData = () => {
        // FIX: Cast 'image' to GeneratedImage to fix type errors with Object.entries.
        const imageData = Object.entries(generatedImages)
            .filter(([, image]) => (image as GeneratedImage).status === 'done' && (image as GeneratedImage).url)
            .reduce((acc, [decade, image]) => {
                acc[decade] = (image as GeneratedImage).url!;
                return acc;
            }, {} as Record<string, string>);

        if (Object.keys(imageData).length < DECADES.length) {
            alert("Please wait for all images to finish generating.");
            return null;
        }
        return imageData;
    }

    const handleDownloadAlbum = async () => {
        const imageData = prepareAlbumData();
        if (!imageData) return;

        setIsDownloading(true);
        try {
            const albumDataUrl = await createAlbumPage(imageData, customCaptions);
            const link = document.createElement('a');
            link.href = albumDataUrl;
            link.download = 'past-forward-album.jpg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error("Failed to create or download album:", error);
            alert("Sorry, there was an error creating your album. Please try again.");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleShareAlbum = async () => {
        const imageData = prepareAlbumData();
        if (!imageData) return;

        setIsDownloading(true); // Reuse isDownloading state to show loading on share button
        try {
            const albumDataUrl = await createAlbumPage(imageData, customCaptions);

            const decadesInAlbum = Object.keys(imageData);
            const fileName = `past-forward-album-${decadesInAlbum[0]}-${decadesInAlbum[decadesInAlbum.length - 1]}.jpg`;
            const shareTitle = `My Past Forward Album: ${decadesInAlbum[0]} - ${decadesInAlbum[decadesInAlbum.length - 1]}`;

            const file = await dataUrlToFile(albumDataUrl, fileName);
            
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: shareTitle,
                    text: 'I traveled through time with Past Forward! Check out my album.',
                });
            } else {
                 console.error("This album file can't be shared by the browser.");
            }
        } catch (error) {
            if ((error as DOMException).name !== 'AbortError') {
                console.error("Error sharing album:", error);
                alert("Sorry, there was an error preparing your album for sharing.");
            }
        } finally {
            setIsDownloading(false);
        }
    };


    return (
        <main className="bg-black text-neutral-200 min-h-screen w-full flex flex-col items-center justify-center p-4 pb-24 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-full bg-grid-white/[0.05]"></div>
            
            <div className="z-10 flex flex-col items-center justify-center w-full h-full flex-1 min-h-0">
                <div className="text-center mb-10">
                    <h1 className="text-6xl md:text-8xl font-caveat font-bold text-neutral-100">Past Forward</h1>
                    <p className="font-permanent-marker text-neutral-300 mt-2 text-xl tracking-wide">Generate yourself through the decades.</p>
                </div>

                {appState === 'idle' && (
                     <div className="relative flex flex-col items-center justify-center w-full">
                        {/* Ghost polaroids for intro animation */}
                        {GHOST_POLAROIDS_CONFIG.map((config, index) => (
                             <motion.div
                                key={index}
                                className="absolute w-80 h-[26rem] rounded-md p-4 bg-neutral-100/10 blur-sm"
                                initial={config.initial}
                                animate={{
                                    x: "0%", y: "0%", rotate: (Math.random() - 0.5) * 20,
                                    scale: 0,
                                    opacity: 0,
                                }}
                                transition={{
                                    ...config.transition,
                                    ease: "circOut",
                                    duration: 2,
                                }}
                            />
                        ))}
                        <motion.div
                             initial={{ opacity: 0, scale: 0.8 }}
                             animate={{ opacity: 1, scale: 1 }}
                             transition={{ delay: 2, duration: 0.8, type: 'spring' }}
                             className="flex flex-col items-center"
                        >
                            <label htmlFor="file-upload" className="cursor-pointer group transform hover:scale-105 transition-transform duration-300">
                                 <PolaroidCard 
                                     caption="Click to begin"
                                     status="done"
                                 />
                            </label>
                            <input id="file-upload" type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleImageUpload} />
                            <p className="mt-8 font-permanent-marker text-neutral-500 text-center max-w-xs text-lg">
                                Click the polaroid to upload your photo and start your journey through time.
                            </p>
                        </motion.div>
                    </div>
                )}

                {appState === 'image-uploaded' && uploadedImage && (
                    <div className="flex flex-col items-center gap-6">
                         <PolaroidCard 
                            imageUrl={uploadedImage} 
                            caption="Your Photo" 
                            status="done"
                         />
                         <div className="flex items-center gap-4 mt-4">
                            <button onClick={handleReset} className={secondaryButtonClasses}>
                                Different Photo
                            </button>
                            <button onClick={handleGenerateClick} className={primaryButtonClasses}>
                                Generate
                            </button>
                         </div>
                    </div>
                )}

                {(appState === 'generating' || appState === 'results-shown') && (
                     <>
                        {isMobile ? (
                            <div className="w-full max-w-sm flex-1 overflow-y-auto mt-4 space-y-8 p-4">
                                {DECADES.map((decade) => (
                                    <div key={decade} className="flex justify-center">
                                         <PolaroidCard
                                            caption={decade}
                                            status={generatedImages[decade]?.status || 'pending'}
                                            imageUrl={generatedImages[decade]?.url}
                                            error={generatedImages[decade]?.error}
                                            onShake={handleRegenerateDecade}
                                            onDownload={handleDownloadIndividualImage}
                                            onShare={handleShareIndividualImage}
                                            canShare={canShare}
                                            isMobile={isMobile}
                                            customCaption={customCaptions[decade]}
                                            onCaptionChange={handleCaptionChange}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <Reorder.Group
                                as="div"
                                axis="x"
                                values={orderedDecades}
                                onReorder={setOrderedDecades}
                                className="w-full max-w-6xl h-auto py-8 grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-12 place-items-center"
                            >
                                {orderedDecades.map((decade) => {
                                    const originalIndex = DECADES.indexOf(decade);
                                    const { rotate } = POSITIONS[originalIndex];
                                    return (
                                        <Reorder.Item
                                            key={decade}
                                            value={decade}
                                            className="cursor-grab active:cursor-grabbing relative z-10 hover:z-20"
                                            style={{ rotate: `${rotate}deg` }}
                                            initial={{ opacity: 0, scale: 0.5, y: 100 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            transition={{ type: 'spring', stiffness: 100, damping: 20, delay: originalIndex * 0.1 }}
                                            whileDrag={{ scale: 1.1, zIndex: 30, rotate: `${rotate}deg`}}
                                        >
                                            <PolaroidCard 
                                                enableDragging={false}
                                                caption={decade}
                                                status={generatedImages[decade]?.status || 'pending'}
                                                imageUrl={generatedImages[decade]?.url}
                                                error={generatedImages[decade]?.error}
                                                onShake={handleRegenerateDecade}
                                                onDownload={handleDownloadIndividualImage}
                                                onShare={handleShareIndividualImage}
                                                canShare={canShare}
                                                isMobile={isMobile}
                                                customCaption={customCaptions[decade]}
                                                onCaptionChange={handleCaptionChange}
                                            />
                                        </Reorder.Item>
                                    );
                                })}
                            </Reorder.Group>
                        )}
                         <div className="h-20 mt-4 flex items-center justify-center">
                            {appState === 'results-shown' && (
                                <div className="flex flex-col sm:flex-row items-center gap-4">
                                    <button 
                                        onClick={handleDownloadAlbum} 
                                        disabled={isDownloading} 
                                        className={`${primaryButtonClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {isDownloading ? 'Creating...' : 'Download Album'}
                                    </button>
                                     {canShare && (
                                        <button 
                                            onClick={handleShareAlbum} 
                                            disabled={isDownloading} 
                                            className={`${secondaryButtonClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
                                        >
                                            {isDownloading ? 'Preparing...' : 'Share Album'}
                                        </button>
                                    )}
                                    <button onClick={handleReset} className={secondaryButtonClasses}>
                                        Start Over
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
            <Footer />
        </main>
    );
}

export default App;